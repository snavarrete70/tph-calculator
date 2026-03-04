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
const burnoutBufferRatio = 0.10;
const maxBucketsPerDay = 2;
const contextSwitchPenaltyMinutes = 30;
const wednesdayIndex = 2;

const workflowWeights = workflowDefinitions.map((workflow) => (workflow.minutes * targetTphPerHour) / 60);
const completedByWorkflow = workflowDefinitions.map(() => 0);

const form = document.getElementById("tph-form");
const timeModeInput = document.getElementById("time-mode");
const hoursPartInput = document.getElementById("hours-part");
const minutesPartInput = document.getElementById("minutes-part");
const totalMinutesInput = document.getElementById("total-minutes");
const totalHoursInput = document.getElementById("total-hours");
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
let estimateTimeButton = document.getElementById("estimate-time");
let buildPlanButton = document.getElementById("build-plan");
let timeNeededBox = document.getElementById("time-needed");
let planOutputBox = document.getElementById("plan-output");
const dayHourInputs = plannerDays.map((day) => ({ ...day, input: document.getElementById(`hours-${day.id}`) }));
const dailyCapInputs = plannerDays.map((day) => ({ ...day, input: document.getElementById(`cap-${day.id}`) }));
const dailyWiresInputs = plannerDays.map((day) => ({ ...day, input: document.getElementById(`wires-${day.id}`) }));
const historyEntries = [];

if (!estimateTimeButton) {
  const actions = form.querySelector(".actions");
  if (actions) {
    estimateTimeButton = document.createElement("button");
    estimateTimeButton.type = "button";
    estimateTimeButton.id = "estimate-time";
    estimateTimeButton.className = "secondary";
    estimateTimeButton.textContent = "Estimate Time Needed";
    actions.insertBefore(estimateTimeButton, resetButton || null);
  }
}

if (!timeNeededBox && resultBox?.parentNode) {
  timeNeededBox = document.createElement("div");
  timeNeededBox.id = "time-needed";
  timeNeededBox.className = "result secondary-result";
  timeNeededBox.setAttribute("aria-live", "polite");
  timeNeededBox.textContent = "Time needed at 12 TPH will appear here.";
  resultBox.parentNode.insertBefore(timeNeededBox, resultBox.nextSibling);
}

if (!planOutputBox && resultBox?.parentNode) {
  planOutputBox = document.createElement("div");
  planOutputBox.id = "plan-output";
  planOutputBox.className = "result secondary-result";
  planOutputBox.setAttribute("aria-live", "polite");
  planOutputBox.textContent = "Weekly plan recommendations will appear here.";
  resultBox.parentNode.appendChild(planOutputBox);
}

function setResult(message, isError = false) {
  resultBox.textContent = message;
  resultBox.classList.toggle("error", isError);
}

function setTimeNeeded(message, isError = false) {
  if (!timeNeededBox) {
    return;
  }
  timeNeededBox.textContent = message;
  timeNeededBox.classList.toggle("error", isError);
}

function setPlanOutput(html, isError = false) {
  if (!planOutputBox) {
    return;
  }
  planOutputBox.innerHTML = html;
  planOutputBox.classList.toggle("error", isError);
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

    const rawValue = day.input.value;
    const value = Number(rawValue || 0);

    if (!Number.isFinite(value) || value < 0) {
      return { error: `Invalid available hours for ${day.label}.` };
    }

    dayHours.push({ id: day.id, label: day.label, hours: value });
  }

  return { dayHours };
}

function getDailyCases(dayInputs, label) {
  const dayCases = [];

  for (const day of dayInputs) {
    if (!day.input) {
      continue;
    }

    const rawValue = day.input.value;
    const value = Number(rawValue || 0);

    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      return { error: `Invalid ${label} assignments for ${day.label}. Use whole numbers.` };
    }

    dayCases.push({ id: day.id, label: day.label, cases: value });
  }

  return { dayCases };
}

function getBucketLabel(bucketId) {
  const bucket = bucketDefinitions.find((entry) => entry.id === bucketId);
  return bucket ? bucket.label : bucketId;
}

function isWednesdayDueWorkflow(name) {
  return /Secondaries$/i.test(name.trim());
}

function isDailyPortionWorkflow(name) {
  return name === "Daily CAP" || name === "Wires";
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

function allocateFixedCasesForDay(index, requiredCases, allocation, minutesUsedRef, capacityMinutes, bucketFocus) {
  const minutesPerCase = workflowDefinitions[index].minutes;
  const bucketId = workflowDefinitions[index].bucket;

  if (!ensureBucketFocus(bucketFocus, bucketId, minutesUsedRef, capacityMinutes)) {
    return 0;
  }

  const capacityLeft = Math.max(0, Math.floor(capacityMinutes - minutesUsedRef.value));
  const maxByCapacity = Math.floor(capacityLeft / minutesPerCase);
  const casesToAllocate = Math.min(requiredCases, maxByCapacity);

  if (casesToAllocate <= 0) {
    return 0;
  }

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

  return entries.map((entry) => `${entry.name} x${entry.count}`).join(" | ");
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

  const capDailyResult = getDailyCases(dailyCapInputs, "Daily CAP");
  if (capDailyResult.error) {
    setPlanOutput(capDailyResult.error, true);
    return;
  }

  const wiresDailyResult = getDailyCases(dailyWiresInputs, "Wires");
  if (wiresDailyResult.error) {
    setPlanOutput(wiresDailyResult.error, true);
    return;
  }

  const dailyCapIndex = workflowDefinitions.findIndex((workflow) => workflow.name === "Daily CAP");
  const wiresIndex = workflowDefinitions.findIndex((workflow) => workflow.name === "Wires");

  const planningCases = completedByWorkflow.map((value) => Number(value || 0));
  if (dailyCapIndex >= 0) {
    planningCases[dailyCapIndex] = capDailyResult.dayCases.reduce((sum, day) => sum + day.cases, 0);
  }
  if (wiresIndex >= 0) {
    planningCases[wiresIndex] = wiresDailyResult.dayCases.reduce((sum, day) => sum + day.cases, 0);
  }

  const plannedAssignedCases = planningCases.reduce((sum, count) => sum + count, 0);
  if (plannedAssignedCases <= 0) {
    setPlanOutput("Enter assigned case counts before building a weekly plan.", true);
    return;
  }

  const wednesdayDueIndexes = workflowDefinitions
    .map((workflow, index) => ({ workflow, index }))
    .filter((entry) => isWednesdayDueWorkflow(entry.workflow.name))
    .map((entry) => entry.index);

  const remainingCases = [...planningCases];
  if (dailyCapIndex >= 0) {
    remainingCases[dailyCapIndex] = 0;
  }
  if (wiresIndex >= 0) {
    remainingCases[wiresIndex] = 0;
  }

  const dayPlans = [];
  const missedDailyAssignments = [];

  for (let dayIndex = 0; dayIndex < dayHours.length; dayIndex += 1) {
    const day = dayHours[dayIndex];
    const dailyCapacityMinutes = day.hours * 60 * (1 - burnoutBufferRatio);
    const minutesUsedRef = { value: 0 };
    const bucketFocus = [];
    const allocation = {};

    const fixedAssignments = [];
    if (dailyCapIndex >= 0) {
      fixedAssignments.push({ index: dailyCapIndex, cases: capDailyResult.dayCases[dayIndex]?.cases || 0 });
    }
    if (wiresIndex >= 0) {
      fixedAssignments.push({ index: wiresIndex, cases: wiresDailyResult.dayCases[dayIndex]?.cases || 0 });
    }

    for (const assignment of fixedAssignments) {
      if (assignment.cases <= 0) {
        continue;
      }
      const allocated = allocateFixedCasesForDay(
        assignment.index,
        assignment.cases,
        allocation,
        minutesUsedRef,
        dailyCapacityMinutes,
        bucketFocus,
      );
      if (allocated < assignment.cases) {
        missedDailyAssignments.push(
          `${day.label} ${workflowDefinitions[assignment.index].name}: ${assignment.cases - allocated} not planned`,
        );
      }
    }

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

  const requiredWeightedUnits = planningCases.reduce(
    (sum, count, index) => sum + count * workflowWeights[index],
    0,
  );
  const requiredHours = requiredWeightedUnits / targetTphPerHour;
  const effectiveCapacityHours = totalAvailableHours * (1 - burnoutBufferRatio);

  let statusLine =
    remainingTaskCount > 0
      ? `<strong>Plan status:</strong> ${remainingTaskCount} cases (${formatNumber(remainingMinutes / 60)} hours) remain after this week's safe-capacity plan.`
      : "<strong>Plan status:</strong> All assigned cases can be completed within this week's plan.";

  if (remainingWednesdayDue > 0) {
    statusLine += ` <br /><strong>Deadline risk:</strong> ${remainingWednesdayDue} secondary cases remain beyond Wednesday.`;
  }

  if (missedDailyAssignments.length > 0) {
    statusLine += ` <br /><strong>Day-specific CAP/Wires risk:</strong> ${missedDailyAssignments.join("; ")}.`;
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
      <p><strong>Planning capacity (${formatNumber(burnoutBufferRatio * 100)}% burnout buffer):</strong> ${formatNumber(effectiveCapacityHours)} hours</p>
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
  `;

  setPlanOutput(summaryHtml, remainingTaskCount > 0 || remainingWednesdayDue > 0 || missedDailyAssignments.length > 0);
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

if (estimateTimeButton) {
  estimateTimeButton.addEventListener("click", () => {
    const totals = calculateTotals();
    if (totals.error) {
      setTimeNeeded(totals.error, true);
      return;
    }
    renderTimeNeeded(totals);
  });
}

if (buildPlanButton) {
  buildPlanButton.addEventListener("click", () => {
    buildWeeklyPlan();
  });
}

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
});

timeModeInput.addEventListener("change", () => {
  setTimeMode(timeModeInput.value);
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
  completedByWorkflow[rowIndex] = Number.isFinite(nextValue) ? nextValue : 0;
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
  for (const day of dailyCapInputs) {
    if (day.input) {
      day.input.value = "";
    }
  }
  for (const day of dailyWiresInputs) {
    if (day.input) {
      day.input.value = "";
    }
  }

  renderWorkflowSections();
  setResult("Your weighted TPH will appear here.");
  setTimeNeeded(`Time needed at ${targetTphPerHour} TPH will appear here.`);
  setPlanOutput("Weekly plan recommendations will appear here.");
  hoursPartInput.focus();
});

renderWorkflowSections();
renderHistory();
setTimeMode(timeModeInput.value);
