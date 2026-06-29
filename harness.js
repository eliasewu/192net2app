const fs = require('fs');
const code = fs.readFileSync('scripts/browser-status-banner.js', 'utf8');

let renderCount = 0;
const doc = {
    createElement: (tag) => { renderCount++; return { style: {}, appendChild: () => {}, remove: () => {} }; },
    body: { appendChild: () => {} },
    querySelector: () => ({ remove: () => {} })
};
const win = { addEventListener: () => {} };

new Function('window', 'document', 'MutationObserver', 'setInterval', 'clearInterval', 'location', code)(
    win, doc, class {}, () => {}, () => {}, {}
);

const banner = globalThis.__net2app_status_banner__;

// Step d
banner.simulateGateway();
banner.simulateGateway();
banner.simulateGateway();
const d_renderCount = renderCount;
const d_attemptCount = banner.state.attemptCount;

// Step e
banner.setUp();
const e_status = banner.state.status;

// Step f
banner.simulateGateway();
const f_attemptCount = banner.state.attemptCount;

console.log(JSON.stringify({ d_renderCount, d_attemptCount, e_status, f_attemptCount }));

if (d_renderCount === 1 && d_attemptCount === 3 && e_status === 'up' && f_attemptCount === 1) {
    console.log('ASSERT_PASS');
} else {
    console.log('ASSERT_FAIL');
}
