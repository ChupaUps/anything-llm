import { useCallback, useEffect, useMemo, useState } from "react";
import { isMobile } from "react-device-detect";
import { useTranslation } from "react-i18next";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartLineUp,
  Coins,
  Images,
  MicrophoneStage,
} from "@phosphor-icons/react";
import Sidebar from "@/components/SettingsSidebar";
import useUser from "@/hooks/useUser";
import Admin from "@/models/admin";
import { formatDuration, nFormatter, numberWithCommas } from "@/utils/numbers";
import showToast from "@/utils/toast";

const RANGE_DAYS = 90;
const PERIOD_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
// Shown when the browser does not expose Intl.supportedValuesOf (older Safari).
const FALLBACK_TIME_ZONES = [
  "UTC",
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  "Asia/Almaty",
  "Asia/Tbilisi",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];
const TOKENS_COLOR = "#6366f1";
const IMAGES_COLOR = "#f59e0b";
const AUDIO_COLOR = "#10b981";

const TICK = { fill: "var(--theme-text-secondary)", fontSize: 11 };
const GRID = {
  stroke: "var(--theme-modal-border)",
  strokeOpacity: 0.6,
  strokeDasharray: "3 3",
  vertical: false,
};
const TOOLTIP_STYLE = {
  background: "var(--theme-bg-secondary)",
  border: "1px solid var(--theme-modal-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--theme-text-primary)",
};

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [savingTimeZone, setSavingTimeZone] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const response = await Admin.usageDashboard(RANGE_DAYS);
    setData(response?.success ? response.data : null);
    setError(response?.success ? null : (response?.error ?? "unknown"));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // The start of the reporting period is an administrator-only setting -
  // managers see the current period but cannot move it.
  async function handlePeriodChange(startDay) {
    setSavingPeriod(true);
    const { success, error } = await Admin.updateSystemPreferences({
      usage_period_start_day: Number(startDay),
    });
    if (success) {
      showToast(t("dashboard.period.saved"), "success");
      await fetchDashboard();
    } else {
      console.error(error);
      showToast(t("dashboard.period.saveFailed"), "error");
    }
    setSavingPeriod(false);
  }

  // The time zone is an administrator-only setting as well - it decides which
  // calendar day an event belongs to and where the period starts.
  async function handleTimeZoneChange(timeZone) {
    setSavingTimeZone(true);
    const { success, error } = await Admin.updateSystemPreferences({
      system_timezone: timeZone,
    });
    if (success) {
      showToast(t("dashboard.timezone.saved"), "success");
      await fetchDashboard();
    } else {
      console.error(error);
      showToast(t("dashboard.timezone.saveFailed"), "error");
    }
    setSavingTimeZone(false);
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16 gap-y-6">
          <Header
            title={t("dashboard.title")}
            description={t("dashboard.description")}
            range={t("dashboard.range", { days: RANGE_DAYS })}
          />

          {loading ? (
            <Skeleton.default
              height="70vh"
              width="100%"
              highlightColor="var(--theme-bg-primary)"
              baseColor="var(--theme-bg-secondary)"
              count={1}
              containerClassName="flex w-full"
            />
          ) : !data ? (
            <p className="text-sm text-red-400">
              {t("dashboard.error")} {error && `(${error})`}
            </p>
          ) : (
            <DashboardBody
              data={data}
              isAdmin={isAdmin}
              savingPeriod={savingPeriod}
              savingTimeZone={savingTimeZone}
              onPeriodChange={handlePeriodChange}
              onTimeZoneChange={handleTimeZoneChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ title, description, range }) {
  return (
    <div className="w-full flex flex-col gap-y-1 pb-6 border-white/10 border-b-2">
      <div className="flex gap-x-4 items-center justify-between">
        <p className="text-lg leading-6 font-bold text-theme-text-primary">
          {title}
        </p>
        <span className="text-xs px-3 py-1 rounded-full border border-theme-sidebar-border text-theme-text-secondary">
          {range}
        </span>
      </div>
      <p className="text-xs leading-[18px] font-base text-theme-text-secondary mt-2">
        {description}
      </p>
    </div>
  );
}

function DashboardBody({
  data,
  isAdmin,
  savingPeriod,
  savingTimeZone,
  onPeriodChange,
  onTimeZoneChange,
}) {
  const { t } = useTranslation();

  const rows = useMemo(
    () =>
      (data.series?.days ?? []).map((day, index) => ({
        day,
        tokens: data.series.tokens[index] ?? 0,
        images: data.series.images[index] ?? 0,
        audioMinutes:
          Math.round(((data.series.audioSeconds[index] ?? 0) / 60) * 10) / 10,
      })),
    [data]
  );

  return (
    <>
      <PeriodBar
        data={data}
        isAdmin={isAdmin}
        saving={savingPeriod}
        savingTimeZone={savingTimeZone}
        onChange={onPeriodChange}
        onTimeZoneChange={onTimeZoneChange}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Coins className="h-5 w-5" />}
          label={t("dashboard.cards.tokensTotal")}
          value={numberWithCommas(data.totals.tokens.allTime)}
          hint={`${t("dashboard.cards.prompt")}: ${nFormatter(
            data.totals.tokens.prompt
          )} · ${t("dashboard.cards.completion")}: ${nFormatter(
            data.totals.tokens.completion
          )}`}
        />
        <StatCard
          icon={<ChartLineUp className="h-5 w-5" />}
          label={t("dashboard.cards.tokensPeriod")}
          value={numberWithCommas(data.totals.tokens.period)}
          hint={t("dashboard.cards.since", {
            date: formatDay(data.range.periodStart),
          })}
        />
        <StatCard
          icon={<Images className="h-5 w-5" />}
          label={t("dashboard.cards.imagesPeriod")}
          value={numberWithCommas(data.totals.images.period)}
          hint={t("dashboard.cards.imagesTotal", {
            count: numberWithCommas(data.totals.images.allTime),
          })}
        />
        <StatCard
          icon={<MicrophoneStage className="h-5 w-5" />}
          label={t("dashboard.cards.audioPeriod")}
          value={formatSeconds(data.totals.transcription.periodSeconds)}
          hint={t("dashboard.cards.audioTotal", {
            duration: formatSeconds(data.totals.transcription.allTimeSeconds),
          })}
        />
      </div>

      <ChartCard title={t("dashboard.charts.tokens")}>
        <AreaChart
          data={rows}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="tokensFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TOKENS_COLOR} stopOpacity={0.35} />
              <stop offset="100%" stopColor={TOKENS_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis
            dataKey="day"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={(value) => String(value).slice(5)}
          />
          <YAxis
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value) => nFormatter(value)}
          />
          <RechartsTooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "var(--theme-text-secondary)" }}
            formatter={(value) => [
              numberWithCommas(value),
              t("dashboard.units.tokens"),
            ]}
          />
          <Area
            type="monotone"
            dataKey="tokens"
            stroke={TOKENS_COLOR}
            strokeWidth={2}
            fill="url(#tokensFill)"
            name={t("dashboard.units.tokens")}
          />
        </AreaChart>
      </ChartCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title={t("dashboard.charts.images")}>
          <BarChart
            data={rows}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid {...GRID} />
            <XAxis
              dataKey="day"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            <RechartsTooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--theme-text-secondary)" }}
              formatter={(value) => [value, t("dashboard.units.images")]}
              cursor={{
                fill: "var(--theme-action-menu-item-hover)",
                opacity: 0.4,
              }}
            />
            <Bar
              dataKey="images"
              fill={IMAGES_COLOR}
              radius={[4, 4, 0, 0]}
              name={t("dashboard.units.images")}
            />
          </BarChart>
        </ChartCard>

        <ChartCard title={t("dashboard.charts.audio")}>
          <AreaChart
            data={rows}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="audioFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={AUDIO_COLOR} stopOpacity={0.35} />
                <stop
                  offset="100%"
                  stopColor={AUDIO_COLOR}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis
              dataKey="day"
              tick={TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value) => nFormatter(value)}
            />
            <RechartsTooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--theme-text-secondary)" }}
              formatter={(value) => [value, t("dashboard.units.minutes")]}
            />
            <Area
              type="monotone"
              dataKey="audioMinutes"
              stroke={AUDIO_COLOR}
              strokeWidth={2}
              fill="url(#audioFill)"
              name={t("dashboard.units.minutes")}
            />
          </AreaChart>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Leaderboard
          title={t("dashboard.top.tokens")}
          label={t("dashboard.top.tokensColumn")}
          rows={data.topUsers.tokens}
          formatValue={(row) => numberWithCommas(row.total)}
        />
        <Leaderboard
          title={t("dashboard.top.images")}
          label={t("dashboard.top.imagesColumn")}
          rows={data.topUsers.images}
          formatValue={(row) => numberWithCommas(row.total)}
        />
        <Leaderboard
          title={t("dashboard.top.audio")}
          label={t("dashboard.top.audioColumn")}
          rows={data.topUsers.audioSeconds}
          formatValue={(row) => formatSeconds(row.total)}
        />
      </div>

      <p className="text-xs text-theme-text-secondary">{t("dashboard.note")}</p>
    </>
  );
}

function PeriodBar({
  data,
  isAdmin,
  saving,
  savingTimeZone,
  onChange,
  onTimeZoneChange,
}) {
  const { t } = useTranslation();
  const startDay = data.range.periodStartDay;
  const zones = useMemo(
    () => timeZoneOptions(data.range.timeZone),
    [data.range.timeZone]
  );

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-theme-bg-primary border border-white/5 px-4 py-3">
      <div className="flex flex-col gap-y-1">
        <span className="text-xs font-medium uppercase text-theme-text-secondary">
          {t("dashboard.period.label")}
        </span>
        <span className="text-sm text-theme-text-primary">
          {t("dashboard.period.range", {
            start: formatDay(data.range.periodStart),
            day: startDay,
          })}
        </span>
        <span className="text-xs text-theme-text-secondary">
          {t("dashboard.timezone.current", { zone: data.range.timeZone })}
        </span>
      </div>

      {isAdmin ? (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <label className="flex flex-col gap-y-1 text-xs text-theme-text-secondary">
            {t("dashboard.period.startDay")}
            <select
              value={startDay}
              disabled={saving}
              onChange={(event) => onChange(Number(event.target.value))}
              className="rounded-lg border border-theme-modal-border bg-theme-bg-secondary px-2 py-1 text-xs text-theme-text-primary"
            >
              {PERIOD_DAYS.map((day) => (
                <option key={day} value={day}>
                  {t("dashboard.period.dayOption", { day })}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-y-1 text-xs text-theme-text-secondary">
            {t("dashboard.timezone.label")}
            <select
              value={data.range.timeZone}
              disabled={savingTimeZone}
              onChange={(event) => onTimeZoneChange(event.target.value)}
              className="max-w-[260px] rounded-lg border border-theme-modal-border bg-theme-bg-secondary px-2 py-1 text-xs text-theme-text-primary"
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zoneOptionLabel(zone)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <span className="text-xs text-theme-text-secondary">
          {t("dashboard.period.adminOnly")}
        </span>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, hint }) {
  return (
    <div className="flex flex-col gap-y-2 rounded-2xl bg-theme-bg-primary border border-white/5 p-4">
      <div className="flex items-center gap-x-2 text-theme-text-secondary">
        {icon}
        <span className="text-xs font-medium uppercase">{label}</span>
      </div>
      <p className="text-2xl font-bold text-theme-text-primary">{value}</p>
      <p className="text-xs text-theme-text-secondary">{hint}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="flex flex-col gap-y-3 rounded-2xl bg-theme-bg-primary border border-white/5 p-4">
      <p className="text-sm font-semibold text-theme-text-primary">{title}</p>
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Leaderboard({ title, label, rows = [], formatValue }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-y-3 rounded-2xl bg-theme-bg-primary border border-white/5 p-4">
      <p className="text-sm font-semibold text-theme-text-primary">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-theme-text-secondary">
          {t("dashboard.top.empty")}
        </p>
      ) : (
        <table className="w-full text-xs text-left border-spacing-0">
          <thead className="text-theme-text-secondary uppercase border-white/10 border-b">
            <tr>
              <th scope="col" className="py-2 pr-2 font-bold">
                #
              </th>
              <th scope="col" className="py-2 px-2 font-bold">
                {t("dashboard.top.user")}
              </th>
              <th scope="col" className="py-2 pl-2 font-bold text-right">
                {label}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.userId ?? "unknown"}-${index}`}
                className="border-white/5 border-b last:border-b-0"
              >
                <td className="py-2 pr-2 text-theme-text-secondary">
                  {index + 1}
                </td>
                <td className="py-2 px-2 text-theme-text-primary truncate max-w-[180px]">
                  {row.username || t("dashboard.top.unknown")}
                </td>
                <td className="py-2 pl-2 text-right text-theme-text-primary">
                  {formatValue(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatSeconds(seconds = 0) {
  if (!seconds) return "0s";
  return formatDuration(seconds);
}

// `2026-10-15` -> `15.10.2026`
function formatDay(day) {
  if (!day) return "-";
  const [year, month, date] = String(day).split("-");
  return `${date}.${month}.${year}`;
}

// `Europe/Moscow` -> `Europe/Moscow (UTC+3)`
function zoneOptionLabel(timeZone) {
  const offset = zoneOffsetLabel(timeZone);
  return offset ? `${timeZone} (${offset})` : timeZone;
}

function zoneOffsetLabel(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    return name ? name.replace("GMT", "UTC") : "";
  } catch {
    return "";
  }
}

// Every zone the browser knows about, keeping the currently stored one even if
// it is missing from the platform list.
function timeZoneOptions(current) {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : FALLBACK_TIME_ZONES;
  const zones = new Set(supported);
  if (current) zones.add(current);
  return [...zones].sort((a, b) => a.localeCompare(b));
}
