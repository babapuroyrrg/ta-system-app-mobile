import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

const CHAT_HISTORY_KEY = "ta_ai_chat_history";
const SERVER_CACHE_KEY = "ta_server_cache";
const MAX_HISTORY = 20;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface CachedServer {
  rank: number;
  playing: number;
  maxPlayers: number;
}

// Backend'den AI yanıtı al — API key istemcide yok
async function fetchAIReply(
  messages: { role: "user" | "assistant"; content: string }[],
  serverContext: string
): Promise<string> {
  const base = getApiBaseUrl();
  if (!base) throw new Error("Sunucu bağlantısı kurulamadı.");

  const res = await fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, serverContext }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as { reply?: string };
  return data.reply ?? "(Yanıt alınamadı)";
}

// Sunucu önbelleğinden bağlam metni oluştur
function buildServerContext(servers: CachedServer[]): string {
  if (servers.length === 0) return "Şu an aktif sunucu bilgisi yok.";
  const lines = servers.map(
    (s) => `${s.rank}. Server: ${s.playing}/${s.maxPlayers} oyuncu`
  );
  return `Şu an aktif sunucular:\n${lines.join("\n")}`;
}

export default function AIAsistanScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverContext, setServerContext] = useState("Sunucu bilgisi yükleniyor...");
  const flatListRef = useRef<FlatList>(null);

  // Sohbet geçmişi ve sunucu önbelleğini yükle
  useEffect(() => {
    async function loadData() {
      try {
        const [history, cache] = await Promise.all([
          AsyncStorage.getItem(CHAT_HISTORY_KEY),
          AsyncStorage.getItem(SERVER_CACHE_KEY),
        ]);
        if (history) setMessages(JSON.parse(history));
        if (cache) {
          const servers: CachedServer[] = JSON.parse(cache);
          setServerContext(buildServerContext(servers));
        } else {
          setServerContext("Sunucu bilgisi henüz yok. Ana ekrana gidip yenileyin.");
        }
      } catch {
        setServerContext("Sunucu bilgisi alınamadı.");
      }
    }
    loadData();
  }, []);

  const clearHistory = useCallback(async () => {
    Alert.alert("Sohbeti Temizle", "Tüm sohbet geçmişi silinecek. Emin misin?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Temizle",
        style: "destructive",
        onPress: async () => {
          setMessages([]);
          await AsyncStorage.removeItem(CHAT_HISTORY_KEY).catch(() => {});
        },
      },
    ]);
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    setTimeout(async () => {
      try {
        const apiMessages = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const reply = await fetchAIReply(apiMessages, serverContext);

        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: reply,
          timestamp: Date.now(),
        };

        const finalMessages = [...updatedMessages, assistantMsg];
        setMessages(finalMessages);
        AsyncStorage.setItem(
          CHAT_HISTORY_KEY,
          JSON.stringify(finalMessages.slice(-MAX_HISTORY))
        ).catch(() => {});
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : "Bilinmeyen hata";
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${errMsg}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    }, 0);
  }, [input, loading, messages, serverContext]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        {!isUser && <Text style={styles.bubbleLabel}>🤖 TA Asistan</Text>}
        <Text style={[styles.bubbleText, isUser ? styles.textUser : styles.textAI]}>
          {item.content}
        </Text>
      </View>
    );
  }, []);

  return (
    <ScreenContainer containerClassName="bg-background">
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>AI ASISTAN</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              📡 {serverContext.split("\n")[0]}
            </Text>
          </View>
          <TouchableOpacity style={styles.clearBtn} onPress={clearHistory}>
            <Text style={styles.clearBtnText}>🗑️</Text>
          </TouchableOpacity>
        </View>

        {/* Mesajlar */}
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎖️</Text>
            <Text style={styles.emptyTitle}>TA Asistan Hazır</Text>
            <Text style={styles.emptyDesc}>
              Sunucu durumu, klan stratejileri veya oyun hakkında her şeyi sorabilirsin.
            </Text>
            <View style={styles.suggestionBox}>
              {[
                "En dolu server hangisi?",
                "Bugün kaç kişi oynuyor?",
                "Savaş stratejisi öner",
              ].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.suggestionBtn}
                  onPress={() => {
                    setInput(s);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={renderMessage}
          />
        )}

        {/* Yükleniyor göstergesi */}
        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#4ADE80" />
            <Text style={styles.loadingText}>TA Asistan yazıyor...</Text>
          </View>
        )}

        {/* Input alanı */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Bir şey sor..."
            placeholderTextColor="#64748B"
            multiline
            maxLength={500}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#161B22",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#E2E8F0",
    letterSpacing: 2,
  },
  headerSub: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    maxWidth: 260,
  },
  clearBtn: {
    padding: 6,
    backgroundColor: "#1E293B",
    borderRadius: 8,
  },
  clearBtnText: {
    fontSize: 18,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#E2E8F0",
    letterSpacing: 1,
  },
  emptyDesc: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  suggestionBox: {
    marginTop: 8,
    gap: 8,
    width: "100%",
  },
  suggestionBtn: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  suggestionText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500",
  },
  messageList: {
    padding: 12,
    gap: 10,
    paddingBottom: 8,
  },
  bubble: {
    borderRadius: 14,
    padding: 12,
    maxWidth: "85%",
    gap: 4,
  },
  bubbleUser: {
    backgroundColor: "#4ADE80",
    alignSelf: "flex-end",
  },
  bubbleAI: {
    backgroundColor: "#161B22",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  bubbleLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: "#0D0F14",
    fontWeight: "600",
  },
  textAI: {
    color: "#E2E8F0",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 12,
    color: "#64748B",
    fontStyle: "italic",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    backgroundColor: "#161B22",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  input: {
    flex: 1,
    backgroundColor: "#0D0F14",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#E2E8F0",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: "#4ADE80",
    borderRadius: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#1E293B",
  },
  sendBtnText: {
    fontSize: 18,
    color: "#0D0F14",
    fontWeight: "800",
  },
});
