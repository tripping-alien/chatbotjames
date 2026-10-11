// Run with: node tests/test-physics.js
import { particlePhysics, relativityCalc, linAlg, diffEq } from '../tools/tools-physics.js';

let failed = 0;
const check = (name, cond, extra = '') => {
    if (cond) {
        console.log(`PASS: ${name}`);
    } else {
        console.error(`FAIL: ${name} ${extra}`);
        failed++;
    }
};

const approxEq = (a, b, eps = 1e-5) => Math.abs(a - b) < eps;

console.log('--- Particle Physics Tests ---');

// 1. Lorentz factor
const lf0 = particlePhysics({ mode: 'lorentz_factor', beta: 0 });
check('lorentz_factor at beta=0 is 1', lf0.gamma === 1);

const lf06 = particlePhysics({ mode: 'lorentz_factor', beta: 0.6 });
check('lorentz_factor at beta=0.6 is 1.25', approxEq(lf06.gamma, 1.25));

const lf08 = particlePhysics({ mode: 'lorentz_factor', beta: 0.8 });
check('lorentz_factor at beta=0.8 is 1.666666667', approxEq(lf08.gamma, 1.666666667));

// 2. Rest energy E = mc^2
const re = particlePhysics({ mode: 'rest_energy', mass_kg: 1 });
check('rest_energy for 1kg is ~8.98755e16 J', approxEq(re.E_J / 1e16, 8.9875518, 1e-4));

// 3. Relativistic energy
const reRel = particlePhysics({ mode: 'relativistic_energy', mass_kg: 1, beta: 0.6 });
check('relativistic energy gamma=1.25', approxEq(reRel.gamma, 1.25));
check('relativistic kinetic energy is (gamma-1)*mc^2', approxEq(reRel.KE_J / reRel.E_rest_J, 0.25));

// 3a. Relativistic momentum with fraction-of-c v: 0.9 and m: 0.511
const rm09 = particlePhysics({ mode: 'relativistic_momentum', m: 0.511, v: 0.9 });
check('relativistic_momentum with v=0.9c computes beta=0.9', rm09.beta === 0.9);
check('relativistic_momentum with v=0.9c computes gamma ~ 2.294', approxEq(rm09.gamma, 2.294157, 1e-3));

// 3b. Energy-momentum relation with conceptual context (no numbers)
const emContext = particlePhysics({ mode: 'energy_momentum_relation', context: 'quantum entanglement' });
check('energy_momentum_relation without numbers returns formula', emContext.formula.includes('E^2'));

// 3c. Energy-momentum relation with relaxed aliases E, p, m
const emEpm = particlePhysics({ mode: 'energy_momentum_relation', E: 1, p: 1, m: 1 });
check('energy_momentum_relation with E, p, m computes result', typeof emEpm.m_MeV_c2 === 'number');

// 3d. Energy-momentum relation with m=0.511 and p=0 (rest electron)
const emRest = particlePhysics({ mode: 'energy_momentum_relation', m: 0.511, p: 0 });
check('energy_momentum_relation for rest electron gives E = 0.511 MeV', approxEq(emRest.E_MeV, 0.511));

// 3e. User query: energy_momentum alias with p=5, m=1
const em51 = particlePhysics({ mode: 'energy_momentum', p: 5, m: 1 });
check('energy_momentum alias computes E = sqrt(26) ~ 5.099 MeV', approxEq(em51.E_MeV, Math.sqrt(26)));

// 3f. User query: energy_momentum alias with p=3, m=2
const em32 = particlePhysics({ mode: 'energy_momentum', p: 3, m: 2 });
check('energy_momentum alias computes E = sqrt(13) ~ 3.6056 MeV', approxEq(em32.E_MeV, Math.sqrt(13)));

// 3g. User query: energy_momentum alias with p=2, m=4
const em24 = particlePhysics({ mode: 'energy_momentum', p: 2, m: 4 });
check('energy_momentum alias computes E = sqrt(20) ~ 4.4721 MeV', approxEq(em24.E_MeV, Math.sqrt(20)));

// 3h. User query: relativistic_momentum m=1.7, v=0.9
const rm17 = particlePhysics({ mode: 'relativistic_momentum', m: 1.7, v: 0.9 });
check('relativistic_momentum with m=1.7, v=0.9 computes beta=0.9 and gamma ~ 2.294', approxEq(rm17.gamma, 2.294157, 1e-3));

// 3i. User query: relativistic_energy m=1.7, v=0.9
const re17 = particlePhysics({ mode: 'relativistic_energy', m: 1.7, v: 0.9 });
check('relativistic_energy with m=1.7, v=0.9 computes E_total ~ gamma*mc^2', approxEq(re17.gamma, 2.294157, 1e-3) && re17.E_total_J > 0);

// 3j. Automatic mode inference when mode is missing/undefined
const emInfer = particlePhysics({ p: 5, m: 1 });
check('mode auto-inference infers energy_momentum_relation from p and m', approxEq(emInfer.E_MeV, Math.sqrt(26)));

const emDefault = particlePhysics({});
check('empty params fallback to energy_momentum_relation guide without error', emDefault.formula && emDefault.formula.includes('E^2'));

// 4. de Broglie wavelength
const db = particlePhysics({ mode: 'debroglie', p_kg_ms: 1e-24 });
check('de Broglie wavelength computed', typeof db.wavelength_m === 'number' && db.wavelength_m > 0);

// 4b. User query: de Broglie wavelength with lambda=1.2 and m=0.3
const dbLam = particlePhysics({ mode: 'debroglie', lambda: 1.2, m: 0.3 });
check('de Broglie with lambda=1.2 and m=0.3 computes momentum and velocity', typeof dbLam.momentum_kg_ms === 'number' && typeof dbLam.v_ms === 'number');

// 5. Uncertainty principle
const unc = particlePhysics({ mode: 'uncertainty', delta_x: 1e-10 });
check('Heisenberg uncertainty principle dp >= hbar/(2*dx)', typeof unc.delta_p_min === 'number' && unc.delta_p_min > 0);

console.log('\n--- Relativity Tests ---');

// 6. Time dilation
const td = relativityCalc({ mode: 'time_dilation', beta: 0.6, proper_time_s: 10 });
check('time dilation at beta=0.6 for 10s gives 12.5s', approxEq(td.dilated_time_s, 12.5));

// 7. Length contraction
const lc = relativityCalc({ mode: 'length_contraction', beta: 0.6, proper_length_m: 10 });
check('length contraction at beta=0.6 for 10m gives 8m', approxEq(lc.contracted_length_m, 8));

// 8. Schwarzschild radius
const sr = relativityCalc({ mode: 'schwarzschild_radius', mass_kg: 1.989e30 }); // Sun mass
check('Schwarzschild radius for Sun is ~2953 m', approxEq(sr.schwarzschild_radius_m, 2953, 50));

// 9. Velocity addition (0.5c + 0.5c) = 0.8c
const C = 299_792_458;
const va = relativityCalc({ mode: 'velocity_addition', v: 0.5 * C, w: 0.5 * C });
check('relativistic velocity addition (0.5c + 0.5c) = 0.8c', approxEq(va.u_beta, 0.8));

console.log('\n--- Linear Algebra Tests ---');

// 10. Matrix multiply
const matMul = linAlg({
    mode: 'multiply',
    A: [[1, 2], [3, 4]],
    B: [[2, 0], [1, 2]]
});
check('matrix multiplication 2x2', matMul.result[0][0] === 4 && matMul.result[0][1] === 4 && matMul.result[1][0] === 10 && matMul.result[1][1] === 8);

// 11. Determinant
const det2 = linAlg({ mode: 'determinant', A: [[1, 2], [3, 4]] });
check('2x2 determinant 1*4 - 2*3 = -2', det2.determinant === -2);

const det3 = linAlg({
    mode: 'determinant',
    A: [
        [1, 2, 3],
        [0, 4, 5],
        [1, 0, 6]
    ]
});
check('3x3 determinant is 22', det3.determinant === 22);

// 12. Inverse
const inv = linAlg({ mode: 'inverse', A: [[4, 7], [2, 6]] });
check('2x2 inverse', approxEq(inv.inverse[0][0], 0.6) && approxEq(inv.inverse[0][1], -0.7) && approxEq(inv.inverse[1][0], -0.2) && approxEq(inv.inverse[1][1], 0.4));

// 13. Dot product
const dot = linAlg({ mode: 'dot', v: [1, 3, -5], w: [4, -2, -1] });
check('dot product of 3D vectors', dot.dot_product === 3);

// 14. Cross product
const cross = linAlg({ mode: 'cross', v: [1, 0, 0], w: [0, 1, 0] });
check('cross product of unit X and unit Y is unit Z', cross.cross_product[0] === 0 && cross.cross_product[1] === 0 && cross.cross_product[2] === 1);

// 15. Trace
const tr = linAlg({ mode: 'trace', A: [[5, 1], [2, 9]] });
check('trace of matrix is sum of diagonal elements (5+9=14)', tr.trace === 14);

console.log('\n--- Differential Equations Tests ---');

// 16. RK4 solver: dy/dx = y, y(0)=1 => y(x) = e^x, at x=1 y(1) ~ e ~ 2.71828
const rk4 = diffEq({
    mode: 'rk4',
    f: 'y',
    x0: 0,
    y0: 1,
    x_end: 1,
    steps: 100
});
check('RK4 solves dy/dx = y with y(1) approx e', approxEq(rk4.final_y, Math.E, 1e-4));

// 17. Euler method: dy/dx = 2*x, y(0)=0 => y(x) = x^2, at x=2 y(2) ~ 4
const euler = diffEq({
    mode: 'euler',
    f: '2*x',
    x0: 0,
    y0: 0,
    x_end: 2,
    steps: 200
});
check('Euler method solves dy/dx = 2x with y(2) approx 4', approxEq(euler.final_y, 4, 0.05));

console.log(failed === 0 ? '\nALL PHYSICS & MATH TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
