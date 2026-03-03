const workflowNames = [
  "Backlog CAP",
  "Daily CAP",
  "eIDV Precision",
  "dIDV Precision",
  "Same Face",
  "eIDV",
  "dIDV",
  "IDV Web Based",
  "P2P Taxonomy",
  "Cash in Taxonomy",
  "P2P",
  "P2P FR",
  "Cash In Blocks",
  "Instrument Link Blocks Secondaries",
  "Referrals/ Incentives Blocked",
  "Referrals/ Incentives Paid",
  "CCFR Secondaries",
  "CC General Secondaries",
  "Gov Funds Secondaries",
  "ACH Secondaries",
  "Wires",
  "PMD Secondaries",
  "$Pay",
];
const targetTphPerHour = 12;
const workflowMinutesPerCase = [10, 10, 10, 10, 10, 6, 7, 12, 12, 12, 10, 12, 10, 10, 8, 8, 16, 16, 6, 6, 8, 8, 14];
const workflowWeights = workflowMinutesPerCase.map((minutes) => (minutes * targetTphPerHour) / 60);

const form = document.getElementById("tph-form");
const timeModeInput = document.getElementById("time-mode");
const hoursPartInput = document.getElementById("hours-part");
const minutesPartInput = document.getElementById("minutes-part");
const totalMinutesInput = document.getElementById("total-minutes");
const totalHoursInput = document.getElementById("total-hours");
const timeHoursMinutesGroup = document.getElementById("time-hours-minutes");
const timeTotalMinutesGroup = document.getElementById("time-total-minutes");
const timeTotalHoursGroup = document.getElementById("time-total-hours");
const workflowBody = document.getElementById("workflow-body");
const resultBox = document.getElementById("result");
const resetButton = document.getElementById("reset");
const historyBody = document.getElementById("history-body");
const downloadCsvButton = document.getElementById("download-csv");
const historyEntries = [];

function setResult(message, isError = false) {
  resultBox.textContent = message;
  resultBox.classList.toggle("error", isError);
}

function toCsvValue(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function formatNumber(value) {
  return Number(value).toFixed(2);
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

function createWorkflowRows() {
  const rows = workflowNames
    .map(
      (name, index) => `
        <tr data-row-index="${index}">
          <td>${name}</td>
          <td>
            <input
              class="small-input completed-input"
              type="number"
              min="0"
              step="1"
              value="0"
              aria-label="${name} completed"
            />
          </td>
        </tr>
      `,
    )
    .join("");

  workflowBody.innerHTML = rows;
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
  const rows = workflowBody.querySelectorAll("tr");
  let rawTasks = 0;
  let weightedUnits = 0;

  for (const row of rows) {
    const completedInput = row.querySelector(".completed-input");

    const completed = Number(completedInput.value || 0);
    const rowIndex = Number(row.dataset.rowIndex);
    const weight = workflowWeights[rowIndex];

    if (!Number.isFinite(completed) || !Number.isFinite(weight)) {
      return { error: "Please enter valid numbers in all workflow rows." };
    }

    if (!Number.isInteger(completed)) {
      return { error: "Completed values must be whole numbers." };
    }

    if (completed < 0 || weight < 0) {
      return { error: "Completed values and weights cannot be negative." };
    }

    const rowWeightedUnits = completed * weight;
    rawTasks += completed;
    weightedUnits += rowWeightedUnits;
  }

  return { rawTasks, weightedUnits };
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

workflowBody.addEventListener("focusin", (event) => {
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
  const rows = workflowBody.querySelectorAll("tr");
  for (const row of rows) {
    const completedInput = row.querySelector(".completed-input");
    completedInput.value = "0";
  }
  setResult("Your weighted TPH will appear here.");
  hoursPartInput.focus();
});

createWorkflowRows();
renderHistory();
setTimeMode(timeModeInput.value);
