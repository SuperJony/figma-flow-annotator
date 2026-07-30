const sides = ["auto", "top", "right", "bottom", "left"];
const variants = [
  ["A", "Toolbar panel"],
  ["B", "Endpoint inspector"],
  ["C", "Refresh defaults"],
];

const state = {
  endpoints: [
    { id: "start", name: "ima...e 5", side: "right" },
    { id: "end", name: "Des...- 1", side: "left" },
  ],
  flowAction: "Add text...",
  style: {
    color: "#000000",
    dash: "solid",
    endMarker: "arrow",
    opacity: 100,
    startMarker: "circle",
    strokeWidth: 3,
  },
};

const app = document.querySelector("#app");

window.addEventListener("popstate", render);
window.addEventListener("keydown", (event) => {
  const element = document.activeElement;
  const isEditing =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element?.isContentEditable;
  if (isEditing || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
    return;
  }
  event.preventDefault();
  moveVariant(event.key === "ArrowRight" ? 1 : -1);
});

render();

function render() {
  const variant = getVariant();
  const variantName = variants.find(([key]) => key === variant)?.[1] || variants[0][1];
  app.innerHTML = `
    <div class="page">
      <article class="panel variant-${variant.toLowerCase()}">
        ${renderTitlebar()}
        ${renderTabs()}
        ${renderVariant(variant)}
        <div class="upgrade">Upgrade</div>
        ${renderStateDock()}
      </article>
    </div>
    ${renderSwitcher(variant, variantName)}
  `;
  bindControls();
}

function renderVariant(variant) {
  if (variant === "B") {
    return `
      <section class="section">
        <div class="inspector-layout">
          ${renderPreview()}
          <div class="side-stack">
            <span class="state-label">Start Connection Side</span>
            ${renderSideButtons("start")}
            <span class="state-label">End Connection Side</span>
            ${renderSideButtons("end")}
          </div>
        </div>
      </section>
      <section class="section">
        <div class="toolbar-row compact style-grid">
          ${renderColorControl()}
          ${renderStrokeControl()}
          ${renderOpacityControl()}
          ${renderDashSelect()}
          ${renderMarkerSelects()}
        </div>
        ${renderFlowActionInput()}
      </section>
      ${renderActionBar()}
    `;
  }

  if (variant === "C") {
    return `
      <section class="default-strip">
        ${renderDefaultCell("Route", styleSummary())}
        ${renderDefaultCell("Start", state.style.startMarker)}
        ${renderDefaultCell("End", state.style.endMarker)}
        ${renderDefaultCell("Refresh", refreshSummary())}
      </section>
      <section class="endpoint-zone">
        ${renderPreview()}
        ${renderFlowActionInput()}
      </section>
      <section class="section">
        <div class="toolbar">
          <div class="toolbar-row compact">
            ${renderColorControl()}
            ${renderOpacityControl()}
            ${renderStrokeControl()}
            ${renderDashSelect()}
            <div></div>
          </div>
          <div class="toolbar-row compact side-row">
            ${renderSideSelect("start")}
            ${renderSideSelect("end")}
            ${renderMarkerSelects()}
          </div>
        </div>
      </section>
      ${renderActionBar()}
    `;
  }

  return `
    <section class="section">
      <div class="toolbar">
        <div class="toolbar-row">
          ${renderColorControl()}
          ${renderOpacityControl()}
          <div class="divider"></div>
          ${renderRouteButton("solid", "M7 24 L27 4")}
          ${renderRouteButton("curve", "M7 26 C12 10 22 24 27 6")}
          ${renderRouteButton("orthogonal", "M7 27 L19 27 L19 7 L28 7")}
        </div>
        <div class="toolbar-row compact">
          ${renderStrokeControl()}
          ${renderCornerControl()}
          ${renderDashControl()}
          ${renderMarkerSelects()}
        </div>
        <div class="toolbar-row compact side-row">
          ${renderSideSelect("start")}
          ${renderSideSelect("end")}
          ${renderMarkerSelects()}
        </div>
      </div>
    </section>
    <section class="endpoint-zone">
      ${renderPreview()}
      ${renderFlowActionInput()}
    </section>
    ${renderActionBar()}
  `;
}

function renderTitlebar() {
  return `
    <header class="titlebar">
      <div class="logo" aria-hidden="true"></div>
      <div class="brand">Autoflow</div>
      <button class="close" aria-label="Close prototype"></button>
    </header>
  `;
}

function renderTabs() {
  return `
    <nav class="tabs" aria-label="Prototype sections">
      <button class="tab is-active" type="button">Flows</button>
      <button class="tab" type="button">Shapes</button>
    </nav>
  `;
}

function renderColorControl() {
  return `<input aria-label="Route color" class="swatch" data-bind="color" type="color" value="${state.style.color}" />`;
}

function renderOpacityControl() {
  return `
    <label class="field" title="Opacity">
      <input aria-label="Opacity percent" data-bind="opacity" max="100" min="10" type="number" value="${state.style.opacity}" />
      <span>%</span>
    </label>
  `;
}

function renderStrokeControl() {
  return `
    <label class="field" title="Stroke width">
      <svg class="icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 9 H26 M6 16 H26 M6 23 H26" stroke="#999" stroke-width="3" /></svg>
      <input aria-label="Stroke width" data-bind="strokeWidth" max="8" min="1" type="number" value="${state.style.strokeWidth}" />
    </label>
  `;
}

function renderCornerControl() {
  return `<div class="field muted"><span>20</span></div>`;
}

function renderDashControl() {
  return `
    <button class="icon-button ${state.style.dash === "dash" ? "is-active" : ""}" data-bind="dash" data-value="dash" type="button">
      <svg class="icon" viewBox="0 0 32 32" aria-label="Dashed route"><path d="M5 16 H12 M17 16 H24" stroke="#aaa" stroke-dasharray="3 4" stroke-width="2" /></svg>
    </button>
  `;
}

function renderDashSelect() {
  return `
    <select aria-label="Dash style" class="select-field" data-bind="dash">
      ${["solid", "dash"].map((value) => option(value, state.style.dash)).join("")}
    </select>
  `;
}

function renderMarkerSelects() {
  return `
    <select aria-label="Start marker" class="select-field" data-bind="startMarker">
      ${["none", "circle"].map((value) => option(value, state.style.startMarker)).join("")}
    </select>
    <select aria-label="End marker" class="select-field" data-bind="endMarker">
      ${["none", "arrow"].map((value) => option(value, state.style.endMarker)).join("")}
    </select>
  `;
}

function renderSideSelect(endpointId) {
  const endpoint = getEndpoint(endpointId);
  return `
    <select aria-label="${endpointId} Connection Side" class="select-field" data-side-select="${endpointId}">
      ${sides.map((side) => option(side, endpoint.side)).join("")}
    </select>
  `;
}

function renderSideButtons(endpointId) {
  const endpoint = getEndpoint(endpointId);
  return sides
    .map(
      (side) => `
        <button class="side-button ${endpoint.side === side ? "is-active" : ""}" data-side="${side}" data-side-endpoint="${endpointId}" type="button">
          ${side}
        </button>
      `,
    )
    .join("");
}

function renderRouteButton(value, path) {
  return `
    <button class="icon-button ${state.style.dash === value ? "is-active" : ""}" ${value === "orthogonal" ? 'data-route-lock="true"' : ""} type="button">
      <svg class="icon" viewBox="0 0 32 32" aria-label="${value} route"><path d="${path}" fill="none" stroke="#111" stroke-width="2" /></svg>
    </button>
  `;
}

function renderFlowActionInput() {
  return `<input class="text-input" data-bind="flowAction" placeholder="Add text..." value="${escapeHtml(state.flowAction)}" />`;
}

function renderActionBar() {
  return `
    <section class="section bottom-actions">
      <button class="switch" type="button" aria-label="Draw on selection"></button>
      <div class="action-label">Draw on selection</div>
      <div class="divider"></div>
      <button class="icon-button" type="button" aria-label="Preview visibility">
        <svg class="icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 16 C8 9 24 9 28 16 C24 23 8 23 4 16 Z" fill="none" stroke="#000" stroke-width="2" /><circle cx="16" cy="16" r="4" fill="#000" /></svg>
      </button>
      <button class="icon-button" type="button" aria-label="Refresh Connectors">
        <svg class="icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M25 11 A10 10 0 0 0 8 9 M7 9 H13 M7 9 V3 M7 21 A10 10 0 0 0 24 23 M25 23 H19 M25 23 V29" fill="none" stroke="#000" stroke-width="2" /></svg>
      </button>
    </section>
  `;
}

function renderPreview() {
  const geometry = previewGeometry();
  return `
    <div class="preview">
      <svg viewBox="0 0 416 168" role="img" aria-label="Endpoint preview with visible Connection Points">
        ${renderSvgMarkerDefs()}
        ${renderEndpoint("start", geometry.start)}
        ${renderEndpoint("end", geometry.end)}
        <path class="route" d="${geometry.path}" marker-end="${state.style.endMarker === "arrow" ? "url(#arrow)" : ""}" opacity="${state.style.opacity / 100}" stroke="${state.style.color}" stroke-dasharray="${state.style.dash === "dash" ? "8 8" : "none"}" stroke-width="${state.style.strokeWidth}" />
        ${state.style.startMarker === "circle" ? `<circle cx="${geometry.startPoint.x}" cy="${geometry.startPoint.y}" fill="#fff" r="4" stroke="${state.style.color}" stroke-width="2" />` : ""}
      </svg>
    </div>
  `;
}

function renderSvgMarkerDefs() {
  return `
    <defs>
      <marker id="arrow" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="5">
        <path d="M0 0 L10 5 L0 10 Z" fill="${state.style.color}"></path>
      </marker>
    </defs>
  `;
}

function renderEndpoint(endpointId, rect) {
  const endpoint = getEndpoint(endpointId);
  const points = sidePoints(rect);
  return `
    <g>
      <rect class="endpoint-rect" height="${rect.height}" rx="3" width="${rect.width}" x="${rect.x}" y="${rect.y}"></rect>
      <text class="endpoint-label" dominant-baseline="middle" text-anchor="middle" x="${rect.x + rect.width / 2}" y="${rect.y + rect.height / 2}">${endpoint.name}</text>
      ${Object.entries(points)
        .map(
          ([side, point]) => `
            <circle class="handle ${resolvedSide(endpointId) === side ? "is-active" : ""}" cx="${point.x}" cy="${point.y}" data-side="${side}" data-side-endpoint="${endpointId}" r="5"></circle>
          `,
        )
        .join("")}
    </g>
  `;
}

function renderStateDock() {
  const refreshPayload = refreshSummary();
  return `
    <aside class="state-dock" aria-label="Prototype state">
      <div class="state-grid">
        ${renderStateItem("Selected endpoints", `${state.endpoints[0].name} -> ${state.endpoints[1].name}`)}
        ${renderStateItem("Connection Side", `${state.endpoints[0].side} -> ${state.endpoints[1].side}`)}
        ${renderStateItem("Connector Style", styleSummary())}
        ${renderStateItem("Endpoint Markers", `${state.style.startMarker} -> ${state.style.endMarker}`)}
        ${renderStateItem("Flow Action", state.flowAction || "No Flow Action")}
        ${renderStateItem("Refresh would apply", refreshPayload)}
      </div>
    </aside>
  `;
}

function renderStateItem(label, value) {
  return `
    <div class="state-item">
      <div class="state-label">${label}</div>
      <div class="state-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderDefaultCell(label, value) {
  return `
    <div class="default-cell">
      <div class="state-label">${label}</div>
      <div class="state-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderSwitcher(variant, variantName) {
  if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") {
    return "";
  }
  return `
    <div class="prototype-switcher" aria-label="Prototype variant switcher">
      <button data-variant-move="-1" type="button" aria-label="Previous variant">←</button>
      <span>${variant} - ${variantName}</span>
      <button data-variant-move="1" type="button" aria-label="Next variant">→</button>
    </div>
  `;
}

function bindControls() {
  document.querySelectorAll("[data-bind]").forEach((control) => {
    control.addEventListener("input", updateBoundValue);
    control.addEventListener("change", updateBoundValue);
    if (control instanceof HTMLButtonElement) {
      control.addEventListener("click", updateBoundValue);
    }
  });
  document.querySelectorAll("[data-side-endpoint]").forEach((control) => {
    control.addEventListener("click", () => {
      getEndpoint(control.dataset.sideEndpoint).side = control.dataset.side;
      render();
    });
  });
  document.querySelectorAll("[data-side-select]").forEach((control) => {
    control.addEventListener("change", () => {
      getEndpoint(control.dataset.sideSelect).side = control.value;
      render();
    });
  });
  document.querySelectorAll("[data-variant-move]").forEach((button) => {
    button.addEventListener("click", () => moveVariant(Number(button.dataset.variantMove)));
  });
  document.querySelectorAll("[data-route-lock]").forEach((button) => {
    button.addEventListener("click", () => {
      state.style.dash = "solid";
      render();
    });
  });
}

function updateBoundValue(event) {
  const key = event.currentTarget.dataset.bind;
  if (key === "flowAction") {
    state.flowAction = event.currentTarget.value;
    render();
    return;
  }
  if (key === "opacity" || key === "strokeWidth") {
    state.style[key] = Number(event.currentTarget.value);
  } else if (key === "dash" && event.currentTarget.tagName === "BUTTON") {
    state.style.dash = state.style.dash === "dash" ? "solid" : "dash";
  } else {
    state.style[key] = event.currentTarget.value;
  }
  render();
}

function previewGeometry() {
  const start = { height: 106, width: 160, x: 12, y: 22 };
  const end = { height: 106, width: 160, x: 244, y: 22 };
  const startPoint = sidePoints(start)[resolvedSide("start")];
  const endPoint = sidePoints(end)[resolvedSide("end")];
  const midX = Math.round((startPoint.x + endPoint.x) / 2);
  return {
    end,
    endPoint,
    path: `M ${startPoint.x} ${startPoint.y} L ${midX} ${startPoint.y} L ${midX} ${endPoint.y} L ${endPoint.x} ${endPoint.y}`,
    start,
    startPoint,
  };
}

function sidePoints(rect) {
  return {
    bottom: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
    left: { x: rect.x, y: rect.y + rect.height / 2 },
    right: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
    top: { x: rect.x + rect.width / 2, y: rect.y },
  };
}

function resolvedSide(endpointId) {
  const endpoint = getEndpoint(endpointId);
  if (endpoint.side !== "auto") {
    return endpoint.side;
  }
  return endpointId === "start" ? "right" : "left";
}

function getEndpoint(endpointId) {
  return state.endpoints.find((endpoint) => endpoint.id === endpointId);
}

function getVariant() {
  const requested = new URLSearchParams(location.search).get("variant") || "A";
  return variants.some(([key]) => key === requested) ? requested : "A";
}

function moveVariant(offset) {
  const current = getVariant();
  const currentIndex = variants.findIndex(([key]) => key === current);
  const next = variants[(currentIndex + offset + variants.length) % variants.length][0];
  const url = new URL(location.href);
  url.searchParams.set("variant", next);
  history.replaceState(null, "", url);
  render();
}

function option(value, selected) {
  return `<option ${value === selected ? "selected" : ""} value="${value}">${value}</option>`;
}

function styleSummary() {
  return `${state.style.color}, ${state.style.opacity}%, ${state.style.strokeWidth}px, ${state.style.dash}`;
}

function refreshSummary() {
  return `${styleSummary()}, ${state.style.startMarker} start, ${state.style.endMarker} end`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
