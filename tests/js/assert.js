/**
 * Minimal test framework — assertion library + describe/it runner
 *
 * Usage:
 *   describe('Suite', () => {
 *       it('does something', () => {
 *           assert.equal(1 + 1, 2, 'math works');
 *       });
 *   });
 *
 * Results are written to both the DOM (#test-results) and the console.
 */

const testRunner = (function() {
    let suites = [];
    let currentSuite = null;
    let totalPass = 0;
    let totalFail = 0;

    // ==========================================
    // Assertions
    // ==========================================

    const assert = {
        equal(actual, expected, msg) {
            if (actual !== expected) {
                throw new AssertionError(
                    `${msg || 'equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
                );
            }
        },

        notEqual(actual, expected, msg) {
            if (actual === expected) {
                throw new AssertionError(
                    `${msg || 'notEqual'}: expected value to differ from ${JSON.stringify(expected)}`
                );
            }
        },

        deepEqual(actual, expected, msg) {
            const a = JSON.stringify(actual);
            const b = JSON.stringify(expected);
            if (a !== b) {
                throw new AssertionError(
                    `${msg || 'deepEqual'}: expected ${b}, got ${a}`
                );
            }
        },

        ok(val, msg) {
            if (!val) {
                throw new AssertionError(`${msg || 'ok'}: expected truthy, got ${JSON.stringify(val)}`);
            }
        },

        notOk(val, msg) {
            if (val) {
                throw new AssertionError(`${msg || 'notOk'}: expected falsy, got ${JSON.stringify(val)}`);
            }
        },

        throws(fn, msg) {
            let threw = false;
            try { fn(); } catch (e) { threw = true; }
            if (!threw) {
                throw new AssertionError(`${msg || 'throws'}: expected function to throw`);
            }
        },

        near(actual, expected, tolerance, msg) {
            if (Math.abs(actual - expected) > tolerance) {
                throw new AssertionError(
                    `${msg || 'near'}: expected ${expected} +/- ${tolerance}, got ${actual}`
                );
            }
        },
    };

    class AssertionError extends Error {
        constructor(message) {
            super(message);
            this.name = 'AssertionError';
        }
    }

    // ==========================================
    // Test Runner
    // ==========================================

    function describe(name, fn) {
        currentSuite = { name, tests: [], pass: 0, fail: 0, errors: [] };
        suites.push(currentSuite);
        fn();
        currentSuite = null;
    }

    function it(name, fn) {
        if (!currentSuite) throw new Error('it() must be called inside describe()');
        const test = { name, pass: false, error: null };
        currentSuite.tests.push(test);

        try {
            fn();
            test.pass = true;
            currentSuite.pass++;
            totalPass++;
        } catch (e) {
            test.error = e.message || String(e);
            currentSuite.fail++;
            currentSuite.errors.push({ test: name, error: test.error });
            totalFail++;
        }
    }

    // ==========================================
    // Rendering
    // ==========================================

    function renderResults() {
        const el = document.getElementById('test-results');
        if (!el) return;

        const allPassed = totalFail === 0;

        let html = `<div class="test-summary ${allPassed ? 'all-pass' : 'has-fail'}">`;
        html += `<strong>${totalPass + totalFail} tests: ${totalPass} passed, ${totalFail} failed</strong>`;
        html += `</div>`;

        suites.forEach(suite => {
            const status = suite.fail === 0 ? 'pass' : 'fail';
            html += `<div class="test-suite ${status}">`;
            html += `<div class="suite-header">${esc(suite.name)} (${suite.pass}/${suite.tests.length})</div>`;

            suite.tests.forEach(test => {
                const icon = test.pass ? '<span class="test-pass-icon">&#10003;</span>' : '<span class="test-fail-icon">&#10007;</span>';
                html += `<div class="test-case ${test.pass ? 'pass' : 'fail'}">${icon} ${esc(test.name)}`;
                if (test.error) {
                    html += `<div class="test-error">${esc(test.error)}</div>`;
                }
                html += `</div>`;
            });

            html += `</div>`;
        });

        el.innerHTML = html;

        // Console output
        console.group(`%cTest Results: ${totalPass} passed, ${totalFail} failed`,
            allPassed ? 'color: #4caf50; font-weight: bold' : 'color: #f44336; font-weight: bold');
        suites.forEach(suite => {
            const icon = suite.fail === 0 ? '\u2705' : '\u274c';
            console.group(`${icon} ${suite.name}`);
            suite.tests.forEach(test => {
                if (test.pass) {
                    console.log(`  \u2713 ${test.name}`);
                } else {
                    console.log(`  %c\u2717 ${test.name}: ${test.error}`, 'color: #f44336');
                }
            });
            console.groupEnd();
        });
        console.groupEnd();
    }

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ==========================================
    // Public API
    // ==========================================

    return { assert, describe, it, renderResults, suites, getStats: () => ({ totalPass, totalFail }) };
})();

// Globals for convenience in test files
const { assert, describe, it } = testRunner;
