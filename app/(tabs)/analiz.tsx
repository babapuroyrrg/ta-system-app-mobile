import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

const PLACE_ID = "3231515867";
const SERVER_CACHE_KEY = "ta_server_cache";

interface RobloxServer {
  id: string;
  maxPlayers: number;
  playing: number;
  fps: number;
  ping: number;
}

interface Stats {
  totalPlayers: number;
  totalServers: number;
  avgFps: number;
  avgPing: number;
  avgFill: number;
  hotServers: number;
  maxSingleServer: number;
}

function computeStats(servers: RobloxServer[]): Stats {
  if (servers.length === 0) {
    return { totalPlayers: 0, totalServers: 0, avgFps: 0, avgPing: 0, avgFill: 0, hotServers: 0, maxSingleServer: 0 };
  }
  const totalPlayers = servers.reduce((s, x) => s + x.playing, 0);
  const avgFps = Math.round(servers.reduce((s, x) => s + x.fps, 0) / servers.length);
  const avgPing = Math.round(servers.reduce((s, x) => s + x.ping, 0) / servers.length);
  const avgFill = Math.round(
    (servers.reduce((s, x) => s + (x.maxPlayers > 0 ? x.playing / x.maxPlayers : 0), 0) / servers.length) * 100
  );
  const hotServers = servers.filter((x) => x.playing >= 85).length;
  const maxSingleServer = Math.max(...servers.map((x) => x.playing));
  return { totalPlayers, totalServers: servers.length, avgFps, avgPing, avgFill, hotServers, maxSingleServer };
}

function StatCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: color ?? "#4ADE80" }]}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AnalizScreen() {
  const [servers, setServers] = useState<RobloxServer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const base = getApiBaseUrl();
      if (!base || base.startsWith("/api")) {
        setError("Sunucu URL'i yapılandırılmamış.");
        return;
      }
      const res = await fetch(`${base}/api/roblox/servers/${PLACE_ID}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: RobloxServer[] = (data.data || []).filter(
        (s: RobloxServer) => s.playing > 0 || s.maxPlayers > 0
      );
      setServers(list);
      setStats(computeStats(list));
      setLastUpdated(new Date());

      // Cache'e kaydet (AI asistan kullanır)
      const cacheData = list.map((s, i) => ({
        rank: i + 1,
        playing: s.playing,
        maxPlayers: s.maxPlayers,
      }));
      await AsyncStorage.setItem(SERVER_CACHE_KEY, JSON.stringify(cacheData)).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const fillColor = (pct: number) => {
    if (pct >= 80) return "#EF4444";
    if (pct >= 55) return "#F59E0B";
    return "#4ADE80";
  };

  return (
    <>
      <StatusBar style="light" />
      <ScreenContainer containerClassName="bg-background">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ANALİZ</Text>
          <Text style={styles.headerSub}>Sunucu İstatistikleri</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#4ADE80" />
            <Text style={styles.loadingText}>VERİ YÜKLENİYOR...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
              <Text style={styles.retryBtnText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ADE80" />}
          >
            {/* Özet Kartlar */}
            {stats && (
              <>
                <Text style={styles.sectionTitle}>GENEL DURUM</Text>
                <View style={styles.grid}>
                  <StatCard label="Toplam Oyuncu" value={stats.totalPlayers} color="#4ADE80" />
                  <StatCard label="Aktif Server" value={stats.totalServers} color="#60A5FA" />
                  <StatCard label="Dolu Serverlar" value={stats.hotServers} color="#EF4444" />
                  <StatCard label="En Kalabalık" value={stats.maxSingleServer} unit="kişi" color="#F59E0B" />
                  <StatCard label="Ort. Doluluk" value={stats.avgFill} unit="%" color={fillColor(stats.avgFill)} />
                  <StatCard label="Ort. FPS" value={stats.avgFps} color="#A78BFA" />
                  <StatCard label="Ort. Ping" value={stats.avgPing} unit="ms" color="#34D399" />
                </View>

                {/* Doluluk Çubuğu */}
                <Text style={styles.sectionTitle}>SUNUCU DOLULUK DAĞILIMI</Text>
                {servers.map((s, i) => {
                  const pct = s.maxPlayers > 0 ? Math.round((s.playing / s.maxPlayers) * 100) : 0;
                  const barW = `${pct}%` as `${number}%`;
                  return (
                    <View key={s.id} style={styles.barRow}>
                      <Text style={styles.barLabel}>{i + 1}. Server</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: barW, backgroundColor: fillColor(pct) }]} />
                      </View>
                      <Text style={[styles.barPct, { color: fillColor(pct) }]}>{s.playing}/{s.maxPlayers}</Text>
                    </View>
                  );
                })}
              </>
            )}

            {lastUpdated && (
              <Text style={styles.updatedText}>
                Son güncelleme: {lastUpdated.toLocaleTimeString("tr-TR")}
              </Text>
            )}
          </ScrollView>
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#161B22",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#E2E8F0",
    letterSpacing: 3,
  },
  headerSub: {
    fontSize: 11,
    color: "#64748B",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  scroll: {
    padding: 16,
    gap: 8,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4ADE80",
    letterSpacing: 2.5,
    marginTop: 16,
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    backgroundColor: "#161B22",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    minWidth: "44%",
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
  },
  statUnit: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  statLabel: {
    fontSize: 10,
    color: "#64748B",
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 11,
    color: "#94A3B8",
    width: 70,
    fontWeight: "600",
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#1E293B",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  barPct: {
    fontSize: 11,
    fontWeight: "700",
    width: 60,
    textAlign: "right",
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
    fontSize: 12,
    letterSpacing: 2,
  },
  errorIcon: { fontSize: 40 },
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
  updatedText: {
    textAlign: "center",
    fontSize: 10,
    color: "#334155",
    marginTop: 16,
    letterSpacing: 0.5,
  },
});
