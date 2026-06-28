import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  RefreshControl,
  StyleSheet,
  Platform,
  Alert,
  Animated,
  ImageBackground,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { StatusBar } from "expo-status-bar";
import { getApiBaseUrl } from "@/constants/oauth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";

// Bildirim handler - uygulama açıkken de göster
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const EXPO_PUSH_TOKEN_KEY = "ta_expo_push_token";
const FAVORITES_KEY = "ta_favorite_servers";
const NOTIFIED_SERVERS_KEY = "ta_notified_servers";
const PLACE_ID = "3231515867";
const NOTIFICATION_THRESHOLD = 85;

function getRobloxServersUrl(): string {
  const base = getApiBaseUrl();
  return `${base}/api/roblox/servers/${PLACE_ID}`;
}

interface RobloxServer {
  id: string;
  maxPlayers: number;
  playing: number;
  fps: number;
  ping: number;
}

function getBarColor(ratio: number): string {
  if (ratio >= 0.85) return "#EF4444";
  if (ratio >= 0.6) return "#F59E0B";
  return "#4ADE80";
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("ta-alerts", {
      name: "TA Sunucu Uyarıları",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4ADE80",
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return false;

  // Expo Push Token al ve backend'e kaydet
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    const stored = await AsyncStorage.getItem(EXPO_PUSH_TOKEN_KEY);
    if (stored !== token) {
      // Token değişmişse backend'e bildir
      const base = getApiBaseUrl();
      if (base) {
        await fetch(`${base}/api/push/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(() => {}); // Backend yoksa sessizce geç
      }
      await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
    }
  } catch {
    // Token alınamazsa uygulama çökmemeli
  }

  return true;
}

async function sendServerFullNotification(serverName: string, playerCount: number) {
  // Uygulama ön/arka plandayken lokal bildirim
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "| TA | Turkish Armed Forces",
      body: `${serverName} şu an ${playerCount}+ kişi oynuyor, hemen sen de katıl!`,
      sound: true,
      data: { type: "server_full" },
    },
    trigger: null, // Anında gönder
  });
}

function ServerCard({
  server,
  rank,
  onJoin,
  isFavorite,
  onToggleFavorite,
}: {
  server: RobloxServer;
  rank: number;
  onJoin: (server: RobloxServer) => void;
  isFavorite: boolean;
  onToggleFavorite: (serverId: string) => void;
}) {
  const ratio = server.maxPlayers > 0 ? server.playing / server.maxPlayers : 0;
  const barColor = getBarColor(ratio);
  const barWidth = `${Math.round(ratio * 100)}%` as `${number}%`;
  const isHot = server.playing >= NOTIFICATION_THRESHOLD;

  return (
    <View style={[styles.card, isHot && styles.cardHot]}>
      {isHot && (
        <View style={styles.hotBadge}>
          <Text style={styles.hotBadgeText}>🔥 DOLU</Text>
        </View>
      )}
      <View style={styles.cardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{rank}. Server</Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerCount}>
            <Text style={styles.playerCountNum}>{server.playing}</Text>
            <Text style={styles.playerCountSep}> / </Text>
            <Text style={styles.playerCountMax}>{server.maxPlayers}</Text>
          </Text>
          <Text style={styles.playerLabel}>oyuncu</Text>
        </View>
        <TouchableOpacity
          style={styles.favoriteBtn}
          onPress={() => onToggleFavorite(server.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.favoriteBtnText}>{isFavorite ? "❤️" : "🤍"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: barWidth, backgroundColor: barColor }]} />
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.pingBox}>
          <Text style={styles.pingLabel}>PING</Text>
          <Text style={styles.pingValue}>{Math.round(server.ping)} ms</Text>
        </View>
        <TouchableOpacity
          style={styles.joinBtn}
          onPress={() => onJoin(server)}
          activeOpacity={0.8}
        >
          <Text style={styles.joinBtnText}>Oyuna Katıl</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [servers, setServers] = useState<RobloxServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [notifiedServers, setNotifiedServers] = useState<Set<string>>(new Set());
  const [notifPermission, setNotifPermission] = useState(false);
  const quickJoinAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then((data) => {
      if (data) setFavorites(new Set(JSON.parse(data)));
    });
    AsyncStorage.getItem(NOTIFIED_SERVERS_KEY).then((data) => {
      if (data) setNotifiedServers(new Set(JSON.parse(data)));
    });
    // Bildirim izni iste
    requestNotificationPermission().then(setNotifPermission);
  }, []);

  const toggleFavorite = useCallback(
    async (serverId: string) => {
      const newFavorites = new Set(favorites);
      if (newFavorites.has(serverId)) {
        newFavorites.delete(serverId);
      } else {
        newFavorites.add(serverId);
      }
      setFavorites(newFavorites);
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(newFavorites)));
    },
    [favorites]
  );

  const checkAndNotify = useCallback(
    async (serverList: RobloxServer[]) => {
      if (!notifPermission) return;
      const newNotified = new Set(notifiedServers);
      let changed = false;

      for (let i = 0; i < serverList.length; i++) {
        const server = serverList[i];
        const serverName = `${i + 1}. Server`;
        const isOver85 = server.playing >= NOTIFICATION_THRESHOLD;
        const alreadyNotified = newNotified.has(server.id);

        if (isOver85 && !alreadyNotified) {
          await sendServerFullNotification(serverName, server.playing);
          newNotified.add(server.id);
          changed = true;
        } else if (!isOver85 && alreadyNotified) {
          // Sunucu doluluk düştüyse sıfırla (tekrar bildirim gelebilsin)
          newNotified.delete(server.id);
          changed = true;
        }
      }

      if (changed) {
        setNotifiedServers(new Set(newNotified));
        await AsyncStorage.setItem(NOTIFIED_SERVERS_KEY, JSON.stringify(Array.from(newNotified)));
      }
    },
    [notifPermission, notifiedServers]
  );

  const fetchServers = useCallback(async () => {
    try {
      setError(null);
      const url = getRobloxServersUrl();
      if (!url || url.startsWith("/api")) {
        setError("Sunucu URL'i yapılandırılmamış. EXPO_PUBLIC_API_BASE_URL kontrol edin.");
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: RobloxServer[] = (data.data || [])
        .filter((s: RobloxServer) => s.playing > 0 || s.maxPlayers > 0)
        .sort((a: RobloxServer, b: RobloxServer) => b.playing - a.playing);
      setServers(list);
      setLastUpdated(new Date());
      // Bildirim kontrolü
      checkAndNotify(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      setError(`Serverlar yüklenemedi: ${msg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [checkAndNotify]);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 30000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  // 7 günlük inaktivite yerel bildirimi — uygulama her açıldığında sıfırlanır
  useEffect(() => {
    const INACTIVITY_NOTIF_ID_KEY = "ta_inactivity_notif_id";
    const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

    async function scheduleInactivityNotification() {
      if (Platform.OS === "web") return;
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") return;

        const prevId = await AsyncStorage.getItem(INACTIVITY_NOTIF_ID_KEY);
        if (prevId) {
          await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});
        }

        const notifId = await Notifications.scheduleNotificationAsync({
          content: {
            title: "| TA | Seni Özledik!",
            body: "Hey asker, uzun zamandır oyuna girmediğini görüyorum? TA seni bekliyor, hadi hemen oyuna gir.",
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: SEVEN_DAYS_SEC,
            repeats: false,
          },
        });

        await AsyncStorage.setItem(INACTIVITY_NOTIF_ID_KEY, notifId);
      } catch (e) {
        console.warn("[InactivityNotif] Planlanamadı:", e);
      }
    }

    scheduleInactivityNotification();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchServers();
  }, [fetchServers]);

  const handleJoin = useCallback((server: RobloxServer) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // Doğru Roblox deep link formatı - gameInstanceId ile
    const deepLink = `roblox://placeId=${PLACE_ID}&gameInstanceId=${server.id}`;
    const fallback = `https://www.roblox.com/games/${PLACE_ID}?gameInstanceId=${server.id}`;
    Linking.openURL(deepLink).catch(() => {
      Linking.openURL(fallback).catch(() => {
        Alert.alert("Hata", "Oyuna bağlanılamadı. Lütfen daha sonra tekrar deneyin.");
      });
    });
  }, []);

  const handleQuickJoin = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    // Animasyon
    Animated.sequence([
      Animated.timing(quickJoinAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(quickJoinAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    if (servers.length === 0) {
      Alert.alert("Uyarı", "Henüz server listesi yüklenmedi. Lütfen bekleyin.");
      return;
    }
    // En dolu server = servers[0] (zaten sıralı)
    const topServer = servers[0];
    handleJoin(topServer);
  }, [servers, handleJoin, quickJoinAnim]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const totalPlayers = servers.reduce((sum, s) => sum + s.playing, 0);

  return (
    <>
      <StatusBar style="light" />
      <ScreenContainer containerClassName="bg-background">
        {/* Header */}
        <ImageBackground
          source={require("@/assets/images/header-bg.webp")}
          style={styles.headerBg}
          imageStyle={styles.headerBgImage}
        >
          <View style={styles.headerOverlay}>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>| TA | SYSTEM</Text>
              <Text style={styles.headerSubtitle}>Turkish Army War Simulator</Text>
            </View>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{servers.length}</Text>
              <Text style={styles.statLabel}>Server</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{totalPlayers}</Text>
              <Text style={styles.statLabel}>Oyuncu</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: notifPermission ? "#4ADE80" : "#EF4444" }]}>
                {notifPermission ? "ON" : "OFF"}
              </Text>
              <Text style={styles.statLabel}>Bildirim</Text>
            </View>
          </View>
          </View>
        </ImageBackground>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <Text style={styles.toolbarTitle}>SUNUCU LİSTESİ</Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              setRefreshing(true);
              fetchServers();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.refreshBtnText}>↻ Yenile</Text>
          </TouchableOpacity>
        </View>

        {/* Hızlı Katıl Butonu */}
        <Animated.View style={[styles.quickJoinWrapper, { transform: [{ scale: quickJoinAnim }] }]}>
          <TouchableOpacity
            style={styles.quickJoinBtn}
            onPress={handleQuickJoin}
            activeOpacity={0.85}
          >
            <Text style={styles.quickJoinIcon}>⚡</Text>
            <View>
              <Text style={styles.quickJoinTitle}>HIZLI KATIL</Text>
              <Text style={styles.quickJoinSub}>
                {servers.length > 0
                  ? `En dolu server: ${servers[0].playing} kişi`
                  : "Yükleniyor..."}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {lastUpdated && (
          <Text style={styles.lastUpdated}>
            Son güncelleme: {formatTime(lastUpdated)}
          </Text>
        )}

        {loading && !refreshing ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4ADE80" />
            <Text style={styles.loadingText}>SERVERLAR YÜKLENİYOR...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchServers}>
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : servers.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>🎮</Text>
            <Text style={styles.emptyText}>Şu an aktif server bulunamadı.</Text>
          </View>
        ) : (
          <FlatList
            data={servers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#4ADE80"
                colors={["#4ADE80"]}
              />
            }
            renderItem={({ item, index }) => (
              <ServerCard
                server={item}
                rank={index + 1}
                onJoin={handleJoin}
                isFavorite={favorites.has(item.id)}
                onToggleFavorite={toggleFavorite}
              />
            )}
          />
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  headerBg: {
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "center",
    gap: 8,
  },
  headerBgImage: {
    resizeMode: "cover",
    opacity: 0.4,
  },
  headerOverlay: {
    backgroundColor: "rgba(13,15,20,0.7)",
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  header: {
    backgroundColor: "#0D0F14",
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    alignItems: "center",
    gap: 8,
  },
  headerContent: {
    alignItems: "center",
    gap: 2,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#E2E8F0",
    letterSpacing: 3,
    textShadowColor: "#4ADE80",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#64748B",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22,27,34,0.9)",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    zIndex: 10,
    gap: 20,
  },
  statBox: {
    alignItems: "center",
  },
  statNum: {
    fontSize: 20,
    fontWeight: "800",
    color: "#4ADE80",
  },
  statLabel: {
    fontSize: 9,
    color: "#64748B",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#1E293B",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#161B22",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  toolbarTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4ADE80",
    letterSpacing: 2,
  },
  refreshBtn: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  refreshBtnText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
  },
  quickJoinWrapper: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
  },
  quickJoinBtn: {
    backgroundColor: "#4ADE80",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#4ADE80",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  quickJoinIcon: {
    fontSize: 28,
  },
  quickJoinTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0D0F14",
    letterSpacing: 2,
  },
  quickJoinSub: {
    fontSize: 11,
    color: "#0D0F14",
    opacity: 0.7,
    marginTop: 1,
  },
  lastUpdated: {
    textAlign: "center",
    fontSize: 10,
    color: "#334155",
    paddingVertical: 4,
    backgroundColor: "#0D0F14",
    letterSpacing: 0.5,
  },
  list: {
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "#161B22",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    gap: 10,
  },
  cardHot: {
    borderColor: "#EF4444",
    borderWidth: 1.5,
  },
  hotBadge: {
    position: "absolute",
    top: -1,
    right: 10,
    backgroundColor: "#EF4444",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hotBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rankBadge: {
    backgroundColor: "#0D0F14",
    borderWidth: 1,
    borderColor: "#4ADE80",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rankText: {
    color: "#4ADE80",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  playerInfo: {
    alignItems: "flex-end",
    flex: 1,
  },
  favoriteBtn: {
    padding: 4,
    marginLeft: 8,
  },
  favoriteBtnText: {
    fontSize: 20,
  },
  playerCount: {
    fontSize: 18,
    fontWeight: "800",
  },
  playerCountNum: {
    color: "#F59E0B",
    fontSize: 20,
  },
  playerCountSep: {
    color: "#64748B",
    fontSize: 14,
  },
  playerCountMax: {
    color: "#64748B",
    fontSize: 14,
  },
  playerLabel: {
    fontSize: 10,
    color: "#64748B",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  progressBg: {
    height: 6,
    backgroundColor: "#1E293B",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pingLabel: {
    fontSize: 9,
    color: "#64748B",
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  pingValue: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
  },
  joinBtn: {
    backgroundColor: "#4ADE80",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
  },
  joinBtnText: {
    color: "#0D0F14",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    letterSpacing: 2,
  },
  errorIcon: {
    fontSize: 40,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#1E293B",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4ADE80",
  },
  retryBtnText: {
    color: "#4ADE80",
    fontWeight: "700",
    fontSize: 13,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
  },
});
