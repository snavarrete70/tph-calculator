const STORAGE_KEY = "tph-calculator-state-v1";

const bucketDefinitions = [
  { id: "identity", label: "Identity" },
  { id: "chargebacks", label: "Chargebacks" },
  { id: "banking", label: "Banking" },
];

const plannerDays = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

const workflowDefinitions = [
  { name: "Backlog CAP", minutes: 10, bucket: "identity" },
  { name: "Daily CAP", minutes: 10, bucket: "identity" },
  { name: "eIDV Precision", minutes: 10, bucket: "identity" },
  { name: "dIDV Precision", minutes: 10, bucket: "identity" },
  { name: "Same Face", minutes: 10, bucket: "identity" },
  { name: "eIDV", minutes: 6, bucket: "identity" },
  { name: "dIDV", minutes: 7, bucket: "identity" },
  { name: "IDV Web Based", minutes: 12, bucket: "identity" },
  { name: "P2P Taxonomy", minutes: 12, bucket: "chargebacks" },
  { name: "Cash in Taxonomy", minutes: 12, bucket: "chargebacks" },
  { name: "P2P Secondaries", minutes: 10, bucket: "chargebacks" },
  { name: "P2P FR", minutes: 12, bucket: "chargebacks" },
  { name: "Cash In Blocks Secondaries", minutes: 10, bucket: "chargebacks" },
  { name: "Instrument Link Blocks Secondaries", minutes: 10, bucket: "chargebacks" },
  { name: "Referrals/ Incentives Blocked", minutes: 8, bucket: "chargebacks" },
  { name: "Referrals/ Incentives Paid", minutes: 8, bucket: "chargebacks" },
  { name: "CCFR Secondaries", minutes: 16, bucket: "banking" },
  { name: "CC General Secondaries", minutes: 16, bucket: "banking" },
  { name: "Gov Funds Secondaries", minutes: 6, bucket: "banking" },
  { name: "ACH Secondaries", minutes: 6, bucket: "banking" },
  { name: "Wires", minutes: 8, bucket: "banking" },
  { name: "PMD Secondaries", minutes: 8, bucket: "banking" },
  { name: "$Pay", minutes: 14, bucket: "banking" },
];

const targetTphPerHour = 12;
const burnoutBufferRatio = 0.15;
const maxBucketsPerDay = 2;
const contextSwitchPenaltyMinutes = 20;
const wednesdayIndex = 2;

const workflowWeights = workflowDefinitions.map((workflow) => (workflow.minutes * targetTphPerHour) / 60);
const completedByWorkflow = workflowDefinitions.map(() => 0);
const workflowIndexByNormalized = new Map(
  workflowDefinitions.map((workflow, index) => [normalizeWorkflowName(workflow.name), index]),
);

const form = document.getElementById("tph-form");
const timeModeInput = document.getElementById("time-mode");
const hoursPartInput = document.getElementById("hours-part");
const minutesPartInput = document.getElementById("minutes-part");
const totalMinutesInput = document.getElementById("total-minutes");
const totalHoursInput = document.getElementById("total-hours");
const agentNameInput = document.getElementById("agent-name");
const sheetUrlInput = document.getElementById("sheet-url");
const scriptEndpointInput = document.getElementById("script-endpoint");
const importAssignmentsButton = document.getElementById("import-assignments");
const clearImportButton = document.getElementById("clear-import");
const importStatusBox = document.getElementById("import-status");
const timeHoursMinutesGroup = document.getElementById("time-hours-minutes");
const timeTotalMinutesGroup = document.getElementById("time-total-minutes");
const timeTotalHoursGroup = document.getElementById("time-total-hours");
let workflowSections = document.getElementById("workflow-sections");

if (!workflowSections) {
  const actions = form.querySelector(".actions");
  const legacyWrap = form.querySelector(".table-wrap.workflow-wrap");
  workflowSections = document.createElement("div");
  workflowSections.id = "workflow-sections";
  workflowSections.className = "workflow-sections";

  if (legacyWrap) {
    legacyWrap.remove();
  }

  if (actions) {
    form.insertBefore(workflowSections, actions);
  } else {
    form.appendChild(workflowSections);
  }
}

const resultBox = document.getElementById("result");
const resetButton = document.getElementById("reset");
const historyBody = document.getElementById("history-body");
const downloadCsvButton = document.getElementById("download-csv");
const estimateTimeButton = document.getElementById("estimate-time");
const buildPlanButton = document.getElementById("build-plan");
const timeNeededBox = document.getElementById("time-needed");
const planOutputBox = document.getElementById("plan-output");
const dayHourInputs = plannerDays.map((day) => ({ ...day, input: document.getElementById(`hours-${day.id}`) }));
const historyEntries = [];

loadPersistedState();

function normalizeWorkflowName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function setResult(message, isError = false) {
  resultBox.textContent = message;
  resultBox.classList.toggle("error", isError);
}

function setTimeNeeded(message, isError = false) {
  timeNeededBox.textContent = message;
  timeNeededBox.classList.toggle("error", isError);
}

function setPlanOutput(html, isError = false) {
  planOutputBox.innerHTML = html;
  planOutputBox.classList.toggle("error", isError);
}

function setImportStatus(message, isError = false) {
  if (!importStatusBox) {
    return;
  }
  importStatusBox.textContent = message;
  importStatusBox.classList.toggle("error", isError);
}

function toCsvValue(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function formatNumber(value) {
  return Number(value).toFixed(2);
}

function formatHoursMinutes(totalHours) {
  const totalMinutes = Math.max(0, Math.round(totalHours * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function getPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistState() {
  const dayHours = {};
  for (const day of dayHourInputs) {
    if (!day.input) {
      continue;
    }
    dayHours[day.id] = Number(day.input.value || 0);
  }

  const state = {
    completedByWorkflow,
    dayHours,
    agentName: agentNameInput?.value || "",
    sheetUrl: sheetUrlInput?.value || "",
    endpointUrl: scriptEndpointInput?.value || "",
    timeMode: timeModeInput?.value || "hours-minutes",
    hoursPart: hoursPartInput?.value || "",
    minutesPart: minutesPartInput?.value || "",
    totalMinutes: totalMinutesInput?.value || "",
    totalHours: totalHoursInput?.value || "",
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadPersistedState() {
  const state = getPersistedState();
  if (!state) {
    return;
  }

  if (Array.isArray(state.completedByWorkflow)) {
    for (let i = 0; i < completedByWorkflow.length; i += 1) {
      const value = Number(state.completedByWorkflow[i] || 0);
      completedByWorkflow[i] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    }
  }

  if (state.dayHours) {
    for (const day of dayHourInputs) {
      if (!day.input) {
        continue;
      }
      const value = Number(state.dayHours[day.id] || 0);
      day.input.value = Number.isFinite(value) && value > 0 ? String(value) : "";
    }
  }

  if (agentNameInput && typeof state.agentName === "string") {
    agentNameInput.value = state.agentName;
  }
  if (sheetUrlInput && typeof state.sheetUrl === "string") {
    sheetUrlInput.value = state.sheetUrl;
  }
  if (scriptEndpointInput && typeof state.endpointUrl === "string") {
    scriptEndpointInput.value = state.endpointUrl;
  }

  if (typeof state.timeMode === "string") {
    timeModeInput.value = state.timeMode;
  }
  hoursPartInput.value = state.hoursPart || "";
  minutesPartInput.value = state.minutesPart || "";
  totalMinutesInput.value = state.totalMinutes || "";
  totalHoursInput.value = state.totalHours || "";
}

function setTimeMode(mode) {
  timeHoursMinutesGroup.hidden = mode !== "hours-minutes";
  timeTotalMinutesGroup.hidden = mode !== "total-minutes";
  timeTotalHoursGroup.hidden = mode !== "total-hours";
}

function getHoursWorked() {
  const mode = timeModeInput.value;

  if (mode === "hours-minutes") {
    const hoursPart = Number(hoursPartInput.value || 0);
    const minutesPart = Number(minutesPartInput.value || 0);

    if (!Number.isFinite(hoursPart) || !Number.isFinite(minutesPart)) {
      return { error: "Please enter valid time values." };
    }
    if (hoursPart < 0 || minutesPart < 0) {
      return { error: "Time values cannot be negative." };
    }
    if (minutesPart >= 60) {
      return { error: "Minutes must be less than 60." };
    }

    return { hours: hoursPart + minutesPart / 60 };
  }

  if (mode === "total-minutes") {
    const totalMinutes = Number(totalMinutesInput.value);
    if (!Number.isFinite(totalMinutes)) {
      return { error: "Please enter valid time values." };
    }
    if (totalMinutes < 0) {
      return { error: "Time values cannot be negative." };
    }
    return { hours: totalMinutes / 60 };
  }

  const totalHours = Number(totalHoursInput.value);
  if (!Number.isFinite(totalHours)) {
    return { error: "Please enter valid time values." };
  }
  if (totalHours < 0) {
    return { error: "Time values cannot be negative." };
  }
  return { hours: totalHours };
}

function getDayHours() {
  const dayHours = [];

  for (const day of dayHourInputs) {
    if (!day.input) {
      continue;
    }

    const value = Number(day.input.value || 0);
    if (!Number.isFinite(value) || value < 0) {
      return { error: `Invalid available hours for ${day.label}.` };
    }

    dayHours.push({ id: day.id, label: day.label, hours: value });
  }

  return { dayHours };
}

function getBucketLabel(bucketId) {
  const bucket = bucketDefinitions.find((entry) => entry.id === bucketId);
  return bucket ? bucket.label : bucketId;
}

function isWednesdayDueWorkflow(name) {
  return /Secondaries$/i.test(name.trim());
}

function countActiveDays(dayHours, fromIndex, toIndex) {
  let count = 0;
  for (let index = fromIndex; index <= toIndex; index += 1) {
    if (dayHours[index] && dayHours[index].hours > 0) {
      count += 1;
    }
  }
  return count;
}

function ensureBucketFocus(bucketFocus, bucketId, minutesUsedRef, capacityMinutes) {
  if (bucketFocus.includes(bucketId)) {
    return true;
  }

  if (bucketFocus.length === 0) {
    bucketFocus.push(bucketId);
    return true;
  }

  if (bucketFocus.length >= maxBucketsPerDay) {
    return false;
  }

  if (capacityMinutes - minutesUsedRef.value <= contextSwitchPenaltyMinutes) {
    return false;
  }

  minutesUsedRef.value += contextSwitchPenaltyMinutes;
  bucketFocus.push(bucketId);
  return true;
}

function allocateRequiredCasesForWorkflow(index, requiredCases, remainingCases, allocation, minutesUsedRef, capacityMinutes, bucketFocus) {
  const minutesPerCase = workflowDefinitions[index].minutes;
  const bucketId = workflowDefinitions[index].bucket;

  if (!ensureBucketFocus(bucketFocus, bucketId, minutesUsedRef, capacityMinutes)) {
    return 0;
  }

  const capacityLeft = Math.max(0, Math.floor(capacityMinutes - minutesUsedRef.value));
  const maxByCapacity = Math.floor(capacityLeft / minutesPerCase);
  const casesToAllocate = Math.min(requiredCases, remainingCases[index], maxByCapacity);

  if (casesToAllocate <= 0) {
    return 0;
  }

  remainingCases[index] -= casesToAllocate;
  allocation[index] = (allocation[index] || 0) + casesToAllocate;
  minutesUsedRef.value += casesToAllocate * minutesPerCase;
  return casesToAllocate;
}

function getRemainingMinutesForBucket(bucketId, remainingCases) {
  let minutes = 0;

  for (let index = 0; index < workflowDefinitions.length; index += 1) {
    if (workflowDefinitions[index].bucket !== bucketId) {
      continue;
    }
    minutes += remainingCases[index] * workflowDefinitions[index].minutes;
  }

  return minutes;
}

function pickNextBucket(remainingCases, excludeBuckets = []) {
  let bestBucket = null;
  let bestMinutes = 0;

  for (const bucket of bucketDefinitions) {
    if (excludeBuckets.includes(bucket.id)) {
      continue;
    }

    const minutes = getRemainingMinutesForBucket(bucket.id, remainingCases);
    if (minutes > bestMinutes) {
      bestMinutes = minutes;
      bestBucket = bucket.id;
    }
  }

  return bestBucket;
}

function allocateFromBucket(bucketId, remainingCases, capacityMinutes) {
  const allocation = {};
  let usedMinutes = 0;
  let capacityLeft = Math.max(0, Math.floor(capacityMinutes));

  const bucketIndexes = workflowDefinitions
    .map((workflow, index) => ({ workflow, index }))
    .filter((entry) => entry.workflow.bucket === bucketId);

  const primaryOrder = [...bucketIndexes].sort((a, b) => {
    const scoreA = remainingCases[a.index] * a.workflow.minutes;
    const scoreB = remainingCases[b.index] * b.workflow.minutes;
    return scoreB - scoreA;
  });

  for (const entry of primaryOrder) {
    const index = entry.index;
    const minutesPerCase = entry.workflow.minutes;
    const availableCases = remainingCases[index];

    if (availableCases <= 0 || capacityLeft < minutesPerCase) {
      continue;
    }

    const maxCases = Math.min(availableCases, Math.floor(capacityLeft / minutesPerCase));
    if (maxCases <= 0) {
      continue;
    }

    allocation[index] = (allocation[index] || 0) + maxCases;
    remainingCases[index] -= maxCases;
    const spent = maxCases * minutesPerCase;
    capacityLeft -= spent;
    usedMinutes += spent;
  }

  const fillOrder = [...bucketIndexes].sort((a, b) => a.workflow.minutes - b.workflow.minutes);

  let filled = true;
  while (filled) {
    filled = false;

    for (const entry of fillOrder) {
      const index = entry.index;
      const minutesPerCase = entry.workflow.minutes;

      if (remainingCases[index] <= 0 || capacityLeft < minutesPerCase) {
        continue;
      }

      allocation[index] = (allocation[index] || 0) + 1;
      remainingCases[index] -= 1;
      capacityLeft -= minutesPerCase;
      usedMinutes += minutesPerCase;
      filled = true;
      break;
    }
  }

  return { allocation, usedMinutes };
}

function summarizeDayAllocation(allocation) {
  const entries = Object.entries(allocation)
    .map(([index, count]) => ({
      name: workflowDefinitions[Number(index)].name,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  if (entries.length === 0) {
    return "No cases planned";
  }

  const topEntries = entries.slice(0, 3).map((entry) => `${entry.name} x${entry.count}`);
  if (entries.length > 3) {
    topEntries.push(`+${entries.length - 3} more workflows`);
  }

  return topEntries.join(" | ");
}

function renderRowsForBucket(bucketId) {
  return workflowDefinitions
    .map((workflow, index) => ({ workflow, index }))
    .filter((entry) => entry.workflow.bucket === bucketId)
    .map(
      ({ workflow, index }) => `
        <tr data-row-index="${index}">
          <td>${workflow.name}</td>
          <td>
            <input
              class="small-input completed-input"
              type="number"
              min="0"
              step="1"
              value="${completedByWorkflow[index]}"
              aria-label="${workflow.name} completed"
            />
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderWorkflowSections() {
  const sections = bucketDefinitions
    .map(
      (bucket, index) => `
        <details class="bucket-panel" ${index === 0 ? "open" : ""}>
          <summary>${bucket.label}</summary>
          <div class="table-wrap workflow-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody data-bucket="${bucket.id}">
                ${renderRowsForBucket(bucket.id)}
              </tbody>
            </table>
          </div>
        </details>
      `,
    )
    .join("");

  workflowSections.innerHTML = sections;
}

function renderHistory() {
  if (historyEntries.length === 0) {
    historyBody.innerHTML = '<tr><td colspan="5" class="empty">No calculations yet.</td></tr>';
    downloadCsvButton.disabled = true;
    return;
  }

  const rows = historyEntries
    .map(
      (entry) =>
        `<tr><td>${entry.time}</td><td>${entry.rawTasks}</td><td>${entry.weightedUnits}</td><td>${entry.hours}</td><td>${entry.weightedTph}</td></tr>`,
    )
    .join("");

  historyBody.innerHTML = rows;
  downloadCsvButton.disabled = false;
}

function calculateTotals() {
  let rawTasks = 0;
  let weightedUnits = 0;

  for (let index = 0; index < workflowDefinitions.length; index += 1) {
    const completed = Number(completedByWorkflow[index] || 0);
    const weight = workflowWeights[index];

    if (!Number.isFinite(completed) || !Number.isFinite(weight)) {
      return { error: "Please enter valid numbers in all workflow rows." };
    }
    if (!Number.isInteger(completed)) {
      return { error: "Completed values must be whole numbers." };
    }
    if (completed < 0 || weight < 0) {
      return { error: "Completed values and weights cannot be negative." };
    }

    rawTasks += completed;
    weightedUnits += completed * weight;
  }

  return { rawTasks, weightedUnits };
}

function renderTimeNeeded(totals) {
  if (totals.rawTasks <= 0) {
    setTimeNeeded("Enter case counts to estimate required time at 12 TPH.", true);
    return;
  }

  const neededHours = totals.weightedUnits / targetTphPerHour;
  setTimeNeeded(
    `Time needed at ${targetTphPerHour} TPH: ${formatHoursMinutes(neededHours)} (${formatNumber(neededHours)} hours) for ${formatNumber(totals.rawTasks)} tasks.`,
  );
}

function buildWeeklyPlan() {
  const totals = calculateTotals();
  if (totals.error) {
    setPlanOutput(totals.error, true);
    return;
  }

  if (totals.rawTasks <= 0) {
    setPlanOutput("Enter assigned case counts before building a weekly plan.", true);
    return;
  }

  const dayHoursResult = getDayHours();
  if (dayHoursResult.error) {
    setPlanOutput(dayHoursResult.error, true);
    return;
  }

  const dayHours = dayHoursResult.dayHours;
  const totalAvailableHours = dayHours.reduce((sum, day) => sum + day.hours, 0);

  if (totalAvailableHours <= 0) {
    setPlanOutput("Enter available hours for at least one day to build a plan.", true);
    return;
  }

  const wednesdayDueIndexes = workflowDefinitions
    .map((workflow, index) => ({ workflow, index }))
    .filter((entry) => isWednesdayDueWorkflow(entry.workflow.name))
    .map((entry) => entry.index);

  const remainingCases = completedByWorkflow.map((value) => Number(value || 0));
  const dayPlans = [];

  for (let dayIndex = 0; dayIndex < dayHours.length; dayIndex += 1) {
    const day = dayHours[dayIndex];
    const dailyCapacityMinutes = day.hours * 60 * (1 - burnoutBufferRatio);
    const minutesUsedRef = { value: 0 };
    const bucketFocus = [];
    const allocation = {};

    if (day.hours > 0 && dayIndex <= wednesdayIndex) {
      const remainingWedDays = countActiveDays(dayHours, dayIndex, wednesdayIndex);
      if (remainingWedDays > 0) {
        for (const index of wednesdayDueIndexes) {
          if (remainingCases[index] <= 0) {
            continue;
          }
          const wedQuota = Math.ceil(remainingCases[index] / remainingWedDays);
          allocateRequiredCasesForWorkflow(
            index,
            wedQuota,
            remainingCases,
            allocation,
            minutesUsedRef,
            dailyCapacityMinutes,
            bucketFocus,
          );
        }
      }
    }

    for (let slot = bucketFocus.length; slot < maxBucketsPerDay; slot += 1) {
      const bucketId = pickNextBucket(remainingCases, bucketFocus);
      if (!bucketId) {
        break;
      }

      if (!ensureBucketFocus(bucketFocus, bucketId, minutesUsedRef, dailyCapacityMinutes)) {
        break;
      }

      const capacityForCases = dailyCapacityMinutes - minutesUsedRef.value;
      if (capacityForCases <= 0) {
        break;
      }

      const allocationResult = allocateFromBucket(bucketId, remainingCases, capacityForCases);
      if (allocationResult.usedMinutes <= 0) {
        break;
      }

      minutesUsedRef.value += allocationResult.usedMinutes;

      for (const [index, count] of Object.entries(allocationResult.allocation)) {
        allocation[index] = (allocation[index] || 0) + count;
      }
    }

    const plannedCases = Object.values(allocation).reduce((sum, count) => sum + count, 0);
    const utilization = day.hours > 0 ? (minutesUsedRef.value / (day.hours * 60)) * 100 : 0;

    dayPlans.push({
      ...day,
      minutesUsed: minutesUsedRef.value,
      plannedCases,
      utilization,
      bucketFocus,
      allocation,
    });
  }

  const remainingTaskCount = remainingCases.reduce((sum, count) => sum + count, 0);
  const remainingMinutes = remainingCases.reduce(
    (sum, count, index) => sum + count * workflowDefinitions[index].minutes,
    0,
  );

  const remainingWednesdayDue = wednesdayDueIndexes.reduce((sum, index) => sum + remainingCases[index], 0);

  const requiredHours = totals.weightedUnits / targetTphPerHour;
  const effectiveCapacityHours = totalAvailableHours * (1 - burnoutBufferRatio);

  let statusLine =
    remainingTaskCount > 0
      ? `<strong>Plan status:</strong> ${remainingTaskCount} cases (${formatNumber(remainingMinutes / 60)} hours) remain after this week's safe-capacity plan.`
      : "<strong>Plan status:</strong> All assigned cases can be completed within this week's plan.";

  if (remainingWednesdayDue > 0) {
    statusLine += ` <br /><strong>Deadline risk:</strong> ${remainingWednesdayDue} workflows ending with \"Secondaries\" remain beyond Wednesday.`;
  }

  const rows = dayPlans
    .map((day) => {
      const focusText =
        day.bucketFocus.length > 0
          ? day.bucketFocus.map((bucketId) => getBucketLabel(bucketId)).join(" + ")
          : "Recovery / Admin";

      return `<tr>
        <td>${day.label}</td>
        <td>${focusText}</td>
        <td>${day.plannedCases}</td>
        <td>${formatHoursMinutes(day.minutesUsed / 60)}</td>
        <td>${formatNumber(day.utilization)}%</td>
        <td>${summarizeDayAllocation(day.allocation)}</td>
      </tr>`;
    })
    .join("");

  const summaryHtml = `
    <div class="plan-summary">
      <p><strong>Required time:</strong> ${formatHoursMinutes(requiredHours)} (${formatNumber(requiredHours)} hours)</p>
      <p><strong>Available time entered:</strong> ${formatNumber(totalAvailableHours)} hours</p>
      <p><strong>Planning capacity (15% burnout buffer):</strong> ${formatNumber(effectiveCapacityHours)} hours</p>
      <p>${statusLine}</p>
    </div>
    <div class="table-wrap plan-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Primary Focus</th>
            <th>Cases Planned</th>
            <th>Planned Work Time</th>
            <th>Utilization</th>
            <th>Workflow Mix</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="planner-footnote">Planner logic: workflows ending in "Secondaries" are due by Wednesday. Daily CAP and Wires are treated as bulk weekly intake split flexibly across your available days. Planner keeps a 15% daily buffer and limits to at most 2 buckets/day.</p>
  `;

  setPlanOutput(summaryHtml, remainingTaskCount > 0 || remainingWednesdayDue > 0);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsvAssignments(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("Sheet needs a header row and at least one data row.");
  }

  const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const workflowCol = header.findIndex((cell) => cell.includes("workflow"));
  const casesCol = header.findIndex((cell) => cell.includes("case") || cell.includes("assigned"));

  if (workflowCol < 0 || casesCol < 0) {
    throw new Error("Sheet must include columns like Workflow and Assigned Cases.");
  }

  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line);
    return {
      workflow: columns[workflowCol] || "",
      cases: Number(columns[casesCol] || 0),
    };
  });
}

function parseSheetUrl(sheetUrl) {
  const idMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    return null;
  }

  const gidMatch = sheetUrl.match(/[?&#]gid=(\d+)/);
  return {
    sheetId: idMatch[1],
    gid: gidMatch ? gidMatch[1] : "0",
  };
}

async function fetchAssignmentsFromGoogleSheet(sheetUrl) {
  const parsed = parseSheetUrl(sheetUrl);
  if (!parsed) {
    throw new Error("Invalid Google Sheet URL.");
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/export?format=csv&gid=${parsed.gid}`;
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error("Could not read sheet. Ensure the sheet is shared for viewer access.");
  }

  const csvText = await response.text();
  return parseCsvAssignments(csvText);
}

async function fetchAssignmentsFromEndpoint(endpointUrl, payload) {
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Endpoint request failed (${response.status}).`);
  }

  const data = await response.json();
  if (Array.isArray(data.assignments)) {
    return data.assignments;
  }
  if (Array.isArray(data.rows)) {
    return data.rows;
  }
  if (Array.isArray(data)) {
    return data;
  }

  throw new Error("Endpoint response must include an assignments array.");
}

function applyAssignments(assignments) {
  const nextValues = workflowDefinitions.map(() => 0);
  const unmapped = [];

  for (const row of assignments) {
    const workflowName = row.workflow || row.name || row.Workflow || "";
    const casesValue = Number(row.cases ?? row.assignedCases ?? row.count ?? row.Cases ?? 0);

    if (!workflowName) {
      continue;
    }

    const normalized = normalizeWorkflowName(workflowName);
    const index = workflowIndexByNormalized.get(normalized);

    if (index === undefined) {
      unmapped.push(workflowName);
      continue;
    }

    if (Number.isFinite(casesValue) && casesValue >= 0) {
      nextValues[index] += Math.floor(casesValue);
    }
  }

  for (let index = 0; index < completedByWorkflow.length; index += 1) {
    completedByWorkflow[index] = nextValues[index];
  }

  renderWorkflowSections();
  persistState();

  return { unmapped, mappedCount: nextValues.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0) };
}

async function importAssignments() {
  const agentName = agentNameInput?.value.trim() || "";
  const sheetUrl = sheetUrlInput?.value.trim() || "";
  const endpointUrl = scriptEndpointInput?.value.trim() || "";

  if (!agentName) {
    setImportStatus("Enter agent name before importing.", true);
    return;
  }

  if (!sheetUrl) {
    setImportStatus("Enter a Google Sheet URL before importing.", true);
    return;
  }

  setImportStatus("Importing assignment sheet...");

  try {
    const assignments = endpointUrl
      ? await fetchAssignmentsFromEndpoint(endpointUrl, { agentName, sheetUrl })
      : await fetchAssignmentsFromGoogleSheet(sheetUrl);

    const summary = applyAssignments(assignments);
    const unmappedSuffix =
      summary.unmapped.length > 0
        ? ` Unmapped workflows: ${summary.unmapped.slice(0, 4).join(", ")}${summary.unmapped.length > 4 ? "..." : ""}.`
        : "";

    setImportStatus(`Imported assignments for ${agentName}.${unmappedSuffix}`);
    setResult("Assignments imported. Review values and run calculations.");
  } catch (error) {
    setImportStatus(error.message || "Import failed. Check sheet access or endpoint settings.", true);
  }

  persistState();
}

downloadCsvButton.addEventListener("click", () => {
  if (historyEntries.length === 0) {
    return;
  }

  const header = ["Time", "Raw Tasks", "Weighted Units", "Hours", "Weighted TPH"];
  const lines = [
    header.map(toCsvValue).join(","),
    ...historyEntries.map((entry) =>
      [entry.time, entry.rawTasks, entry.weightedUnits, entry.hours, entry.weightedTph]
        .map(toCsvValue)
        .join(","),
    ),
  ];

  const csvContent = lines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "weighted-tph-history.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

estimateTimeButton?.addEventListener("click", () => {
  const totals = calculateTotals();
  if (totals.error) {
    setTimeNeeded(totals.error, true);
    return;
  }
  renderTimeNeeded(totals);
});

buildPlanButton?.addEventListener("click", () => {
  buildWeeklyPlan();
});

importAssignmentsButton?.addEventListener("click", () => {
  importAssignments();
});

clearImportButton?.addEventListener("click", () => {
  for (let i = 0; i < completedByWorkflow.length; i += 1) {
    completedByWorkflow[i] = 0;
  }
  renderWorkflowSections();
  persistState();
  setImportStatus("Imported case values cleared.");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const timeResult = getHoursWorked();
  if (timeResult.error) {
    setResult(timeResult.error, true);
    return;
  }

  const hours = timeResult.hours;
  if (hours <= 0) {
    setResult("Hours worked must be greater than 0.", true);
    return;
  }

  const totals = calculateTotals();
  if (totals.error) {
    setResult(totals.error, true);
    return;
  }

  const weightedTph = totals.weightedUnits / hours;
  const weightedTphFormatted = formatNumber(weightedTph);

  setResult(
    `Weighted TPH: ${weightedTphFormatted} | Raw Tasks: ${formatNumber(totals.rawTasks)} | Weighted Units: ${formatNumber(totals.weightedUnits)}`,
  );
  renderTimeNeeded(totals);

  historyEntries.unshift({
    time: new Date().toLocaleString(),
    rawTasks: formatNumber(totals.rawTasks),
    weightedUnits: formatNumber(totals.weightedUnits),
    hours: formatNumber(hours),
    weightedTph: weightedTphFormatted,
  });

  renderHistory();
  persistState();
});

timeModeInput.addEventListener("change", () => {
  setTimeMode(timeModeInput.value);
  persistState();
});

workflowSections.addEventListener("input", (event) => {
  const input = event.target.closest(".completed-input");
  if (!input) {
    return;
  }

  const row = input.closest("tr");
  if (!row) {
    return;
  }

  const rowIndex = Number(row.dataset.rowIndex);
  const nextValue = Number(input.value || 0);
  completedByWorkflow[rowIndex] = Number.isFinite(nextValue) ? Math.max(0, Math.floor(nextValue)) : 0;
  persistState();
});

workflowSections.addEventListener("focusin", (event) => {
  const input = event.target.closest(".completed-input");
  if (!input) {
    return;
  }

  if (input.value === "0") {
    input.select();
  }
});

for (const day of dayHourInputs) {
  day.input?.addEventListener("input", () => {
    persistState();
  });
}

[agentNameInput, sheetUrlInput, scriptEndpointInput, hoursPartInput, minutesPartInput, totalMinutesInput, totalHoursInput].forEach(
  (input) => {
    input?.addEventListener("input", () => {
      persistState();
    });
  },
);

resetButton.addEventListener("click", () => {
  timeModeInput.value = "hours-minutes";
  setTimeMode(timeModeInput.value);
  hoursPartInput.value = "";
  minutesPartInput.value = "";
  totalMinutesInput.value = "";
  totalHoursInput.value = "";

  for (let index = 0; index < completedByWorkflow.length; index += 1) {
    completedByWorkflow[index] = 0;
  }

  for (const day of dayHourInputs) {
    if (day.input) {
      day.input.value = "";
    }
  }

  renderWorkflowSections();
  setResult("Your weighted TPH will appear here.");
  setTimeNeeded(`Time needed at ${targetTphPerHour} TPH will appear here.`);
  setPlanOutput("Weekly plan recommendations will appear here.");
  setImportStatus("No assignment sheet imported yet.");
  persistState();
  hoursPartInput.focus();
});

renderWorkflowSections();
renderHistory();
setTimeMode(timeModeInput.value);
setImportStatus("No assignment sheet imported yet.");
