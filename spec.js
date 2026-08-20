/*
 * 家电能效标签 v2.1 - UriRoute 数据脚本
 * ------------------------------------------------------------
 * 功能：读取手机硬件参数（电压/电流/CPU/温度/内存/电池等），
 *       通过 uriRoute.add() 提供给界面显示。
 *
 * ★ 界面下方 4 行显示什么参数？→ 改下方 CONFIG 里的 slot1~slot4
 * ★ 想新增一个可选参数？→ 在 run() 的 paramPool 参数池里加一行
 * ------------------------------------------------------------
 */

// ================ 用户配置区===============
var CONFIG = {
    labelTitle: "Xiao Mi 能效标识",
    labelSubtitle: "PHONE ENERGY LABEL",

    lowText: "耗能低",
    mediumText: "中等",
    highText: "耗能高",





// 注意：4 行参数的"标签"由下方 slot 选择的参数池自动提供，无需在此配置
// 全局刷新间隔（秒），所有参数和等级统一使用此频率。
    refreshInterval: 1,
    /* ============================================================
     * ★★★ 下方 4 行文字显示什么，看这里 ★★★
     * ============================================================
     * 界面下方有 4 行文字，每行由 slot1~slot4 决定显示内容。
     *
     * 【怎么改】
     * 在 slot1~slot4 里填数字即可，例如：
     *   slot1: 4   → 第 1 行显示「电池温度」
     *   slot2: 8   → 第 2 行显示「循环次数」
     *
     * 【数字对应的参数】
     *   0 剩余存储    1 开机时长    2 设备电流    3 设备功率
     *   4 电池温度    5 CPU温度     6 CPU占用率   7 内存占用
     *   8 循环次数    9 电池健康   10 Android版本 11 手机型号
     *  12 电池容量   13 充电状态
     *
     * 【提醒】
     * - 标题（如「电池温度：」）会自动跟着变，不用改界面
     * - 只读取选中的 4 个参数，其余不读取（省电）
     * ============================================================ */
    slot1: 0,   // 第1行 ← 剩余存储
    slot2: 1,   // 第2行 ← 开机时长
    slot3: 2,   // 第3行 ← 设备电流
    slot4: 3,   // 第4行 ← 设备功率

    // 是否显示左侧电量胶囊（true=显示，false=隐藏）
    showCapsule: true
};
var CPU_GRADE_RULES = [
    { max: 20, grade: 1 },
    { max: 40, grade: 2 },
    { max: 60, grade: 3 },
    { max: 80, grade: 4 },
    { max: Infinity, grade: 5 }
];

// =============== 读取工具==================
function readFirstReadable(paths) {
    var command = "for p in " + paths.join(" ") + "; do " +
        "if [ -r \"$p\" ]; then cat \"$p\" 2>/dev/null; exit 0; fi; " +
        "done";
    return uriRoute.shell(command);
}

function toNumber(value) {
    var parsed = parseFloat((value || "").trim());
    return isNaN(parsed) ? null : parsed;
}

function normalizeVoltage(raw) {
    if (raw === null || raw <= 0) return null;
    if (raw >= 100000) return raw / 1000000;
    if (raw >= 100) return raw / 1000;
    return raw;
}

function normalizeCurrent(raw) {
    if (raw === null || raw === 0) return null;
    var sign = raw < 0 ? 1 : -1;
    var absVal = Math.abs(raw);
    if (absVal >= 100000) return sign * absVal / 1000000;
    if (absVal >= 100) return sign * absVal / 1000;
    return sign * absVal;
}

function formatStorageAvailable() {
    var output = (uriRoute.shell("df -k /data 2>/dev/null | tail -n 1") || "").trim();
    var parts = output.split(/\s+/);
    if (parts.length < 4) return "--";
    var availableKb = toNumber(parts[3]);
    if (availableKb === null || availableKb < 0) return "--";
    return (availableKb / 1024 / 1024).toFixed(1) + " GB";
}

function formatUptime() {
    var output = (uriRoute.shell("cat /proc/uptime 2>/dev/null") || "").trim();
    var seconds = toNumber(output.split(/\s+/)[0]);
    if (seconds === null || seconds < 0) return "--";

    var totalMinutes = Math.floor(seconds / 60);
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;
    var text = "";
    if (days > 0) text += days + "天";
    if (hours > 0 || days > 0) text += hours + "时";
    return text + minutes + "分";
}

// =============== 可选参数读取（小米系统 Android 16）================
// 电池温度：/sys/class/power_supply/battery/temp（毫摄氏度 -> 摄氏度）
function getBatteryTemp() {
    var raw = toNumber(readFirstReadable([
        "/sys/class/power_supply/battery/temp",
        "/sys/class/power_supply/bms/temp"
    ]));
    if (raw === null || raw <= 0) return null;
    var t = raw >= 100 ? raw / 10 : raw;
    return t.toFixed(1) + "℃";
}

// CPU/主板温度：遍历 thermal_zone 取第一个有效值
function getCpuTemp() {
    var cmd = "for z in /sys/class/thermal/thermal_zone*/temp; do v=$(cat $z 2>/dev/null); " +
        "if [ -n \"$v\" ] && [ \"$v\" -gt 0 ] 2>/dev/null; then echo $v; break; fi; done";
    var raw = toNumber((uriRoute.shell(cmd) || "").trim());
    if (raw === null) return null;
    var t = raw > 1000 ? raw / 1000 : (raw > 100 ? raw / 10 : raw);
    return t.toFixed(1) + "℃";
}

// 内存占用：/proc/meminfo（MemTotal - MemAvailable）
function getMemoryUsage() {
    var out = uriRoute.shell("cat /proc/meminfo 2>/dev/null") || "";
    var total = 0, available = 0, lines = out.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var m1 = lines[i].match(/^MemTotal:\s*(\d+)/);
        if (m1) { total = +m1[1]; continue; }
        var m2 = lines[i].match(/^MemAvailable:\s*(\d+)/);
        if (m2) { available = +m2[1]; }
    }
    if (!total || !available) return null;
    var usedGb = (total - available) / 1024 / 1024;
    return usedGb.toFixed(1) + "G / " + (total / 1024 / 1024).toFixed(0) + "G";
}

// 电池循环次数：/sys/class/power_supply/battery/cycle_count
function getCycleCount() {
    var raw = toNumber(readFirstReadable([
        "/sys/class/power_supply/battery/cycle_count",
        "/sys/class/power_supply/bms/cycle_count"
    ]));
    return raw === null ? null : Math.round(raw) + "次";
}

// 电池健康度：/sys/class/power_supply/battery/health
function getBatteryHealth() {
    var out = (readFirstReadable([
        "/sys/class/power_supply/battery/health",
        "/sys/class/power_supply/bms/health"
    ]) || "").trim();
    if (!out) return null;
    var map = { "Good": "良好", "Dead": "报废", "Overheat": "过热", "Over voltage": "过压", "Cold": "过冷" };
    return map[out] || out;
}

// Android 版本：getprop ro.build.version.release
function getAndroidVersion() {
    return (uriRoute.shell("getprop ro.build.version.release 2>/dev/null") || "").trim() || null;
}

// 手机型号：getprop ro.product.model
function getDeviceModel() {
    return (uriRoute.shell("getprop ro.product.model 2>/dev/null") || "").trim() || null;
}

// 电池容量百分比：/sys/class/power_supply/battery/capacity
function getBatteryCapacity() {
    var raw = toNumber(readFirstReadable([
        "/sys/class/power_supply/battery/capacity",
        "/sys/class/power_supply/bms/capacity"
    ]));
    return raw === null ? null : Math.round(raw);
}

// 充电状态：/sys/class/power_supply/battery/status
function getChargeStatus() {
    var out = (readFirstReadable([
        "/sys/class/power_supply/battery/status",
        "/sys/class/power_supply/bms/status"
    ]) || "").trim();
    if (!out) return null;
    var map = { "Charging": "充电中", "Discharging": "放电中", "Full": "已充满", "Not charging": "未充电", "Unknown": "未知" };
    return map[out] || out;
}

function getCpuUsage() {
    var curCpuinfo = (uriRoute.shell("awk '/^cpu /{print $2,$4,$5;exit}' /proc/stat") || "").trim();
    var preCpuinfo = uriRoute.getValue("preCpuinfo");
    uriRoute.saveEnv("preCpuinfo", curCpuinfo);
    if (!curCpuinfo || !preCpuinfo) return null;
    var c = curCpuinfo.split(/\s+/);
    var p = preCpuinfo.trim().split(/\s+/);
    var busy = (+c[0] + +c[1]) - (+p[0] + +p[1]);
    var total = (+c[0] + +c[1] + +c[2]) - (+p[0] + +p[1] + +p[2]);
    if (total <= 0) return null;
    return (busy * 100) / total;
}

function gradeForCpu(cpuPercent) {
    if (cpuPercent === null || !isFinite(cpuPercent) || cpuPercent < 0) return 0;
    for (var i = 0; i < CPU_GRADE_RULES.length; i++) {
        if (cpuPercent <= CPU_GRADE_RULES[i].max) return CPU_GRADE_RULES[i].grade;
    }
    return 0;
}

function addText(name, value) {
    uriRoute.add(name, value == null ? "" : String(value));
}

function addVisibleGrade(grade) {
    addText("gradeIndex", grade > 0 ? grade : "");
    addText("gradeText", grade > 0 ? grade + "级" : "");
    for (var i = 1; i <= 5; i++) {
        addText("grade" + i + "Visible", grade === i ? "1" : "");
    }
}

function run() {
    // 只有选中了「设备电流」(2) 或「设备功率」(3) 才读取电压/电流，省电
    var needPower = CONFIG.slot1 === 2 || CONFIG.slot1 === 3 ||
                    CONFIG.slot2 === 2 || CONFIG.slot2 === 3 ||
                    CONFIG.slot3 === 2 || CONFIG.slot3 === 3 ||
                    CONFIG.slot4 === 2 || CONFIG.slot4 === 3;
    var voltage = null, current = null, power = null;
    if (needPower) {
        voltage = normalizeVoltage(toNumber(readFirstReadable([
            // ---- 第一优先级：小米系统主节点 ----
            "/sys/class/power_supply/battery/voltage_now",
            "/sys/class/power_supply/bms/voltage_now",
            "/sys/class/power_supply/Battery/voltage_now",
            // ---- 第二优先级：新机型补充节点 ----
            "/sys/class/power_supply/main/voltage_now",
            "/sys/class/power_supply/charger/voltage_now",
            "/sys/class/power_supply/step_charger/voltage_now",
            // ---- 第三优先级：avg 备选节点 ----
            "/sys/class/power_supply/battery/voltage_avg",
            "/sys/class/power_supply/bms/voltage_avg"
        ])));
        current = normalizeCurrent(toNumber(readFirstReadable([
            // ---- 第一优先级：小米系统主节点 ----
            "/sys/class/power_supply/battery/current_now",
            "/sys/class/power_supply/bms/current_now",
            "/sys/class/power_supply/Battery/current_now",
            // ---- 第二优先级：新机型补充节点 ----
            "/sys/class/power_supply/main/current_now",
            "/sys/class/power_supply/charger/current_now",
            "/sys/class/power_supply/step_charger/current_now",
            // ---- 第三优先级：avg 备选节点 ----
            "/sys/class/power_supply/battery/current_avg",
            "/sys/class/power_supply/bms/current_avg"
        ])));
        power = voltage !== null && current !== null ? voltage * current : null;
    }

// CPU 负载百分比决定能效等级（与其他参数同频刷新）
    var cpuPercent = getCpuUsage();
    var grade = gradeForCpu(cpuPercent);

    var currentStr = current === null ? "-- A" : current.toFixed(3) + " A";
    var powerStr = power === null ? "-- W" : power.toFixed(3) + " W";

    addText("labelTitle", CONFIG.labelTitle);
    addText("labelSubtitle", CONFIG.labelSubtitle);
    addText("lowText", CONFIG.lowText);
    addText("mediumText", CONFIG.mediumText);
    addText("highText", CONFIG.highText);
    addText("level1Text", "1");
    addText("level2Text", "2");
    addText("level3Text", "3");
    addText("level4Text", "4");
    addText("level5Text", "5");
    /* ============================================================
     * 参数池：所有可选的手机参数都定义在这里
     * 每项格式：{ label: "标题：", get: 读取函数 }
     *   label = 界面显示的标题（选了它，标题自动跟随）
     *   get   = 读取数值的函数（返回字符串或 null）
     * 说明：一般不用改这里，改上方 CONFIG 的 slot 编号即可；
     *       想新增参数时，按同样格式加一行即可。
     * ============================================================ */
    var paramPool = [
        { label: "剩余存储：", get: formatStorageAvailable },
        { label: "开机时长：", get: formatUptime },
        { label: "设备电流：", get: function() { return currentStr; } },
        { label: "设备功率：", get: function() { return powerStr; } },
        { label: "电池温度：", get: getBatteryTemp },
        { label: "CPU温度：", get: getCpuTemp },
        { label: "CPU占用：", get: function() { return cpuPercent === null ? null : cpuPercent.toFixed(1) + "%"; } },
        { label: "内存占用：", get: getMemoryUsage },
        { label: "循环次数：", get: getCycleCount },
        { label: "电池健康：", get: getBatteryHealth },
        { label: "Android版本：", get: getAndroidVersion },
        { label: "手机型号：", get: getDeviceModel },
        { label: "电池容量：", get: function() { var c = getBatteryCapacity(); return c === null ? null : c + "%"; } },
        { label: "充电状态：", get: getChargeStatus }
    ];
    // 槽位 → UI 4 行映射
    var slotMap = [
        { idx: CONFIG.slot1, labelVar: "manufacturerLabel", textVar: "manufacturerText" },
        { idx: CONFIG.slot2, labelVar: "modelLabel", textVar: "modelText" },
        { idx: CONFIG.slot3, labelVar: "currentLabel", textVar: "currentText" },
        { idx: CONFIG.slot4, labelVar: "powerLabel", textVar: "powerText" }
    ];
    for (var i = 0; i < slotMap.length; i++) {
        var sd = slotMap[i];
        var p = (sd.idx >= 0 && sd.idx < paramPool.length) ? paramPool[sd.idx] : null;
        if (p) {
            var v = p.get();
            addText(sd.labelVar, p.label);
            addText(sd.textVar, v == null ? "--" : String(v));
        } else {
            addText(sd.labelVar, "");
            addText(sd.textVar, "");
        }
    }
    addVisibleGrade(grade);
    addText("showCapsule", CONFIG.showCapsule ? "1" : "0");
}

