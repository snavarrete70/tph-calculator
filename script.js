const bucketDefinitions = [
  { id: "identity", label: "Identity" },
  { id: "chargebacks", label: "Chargebacks" },
  { id: "banking", label: "Banking" },
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
let timeNeededBox = document.getElementById("time-needed");
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

  renderWorkflowSections();
  setResult("Your weighted TPH will appear here.");
  setTimeNeeded(`Time needed at ${targetTphPerHour} TPH will appear here.`);
  hoursPartInput.focus();
});

renderWorkflowSections();
renderHistory();
setTimeMode(timeModeInput.value);
