/**
 * tools-physics.js — Pure-JS scientific calculators for JAMES tools-worker.
 * No external dependencies. Runs inside a Web Worker.
 *
 * Exports: particlePhysics, relativityCalc, linAlg, diffEq
 */

// ── Physical Constants ────────────────────────────────────────────────────────
const C    = 299_792_458;           // m/s  — speed of light
const H    = 6.626_070_015e-34;     // J·s  — Planck constant
const HBAR = 1.054_571_817e-34;     // J·s  — reduced Planck (ħ)
const M_E  = 9.109_383_701_5e-31;   // kg   — electron mass
const EV   = 1.602_176_634e-19;     // J    — 1 electronvolt
const G    = 6.674_30e-11;          // N·m²/kg² — gravitational constant

// ── Helpers ───────────────────────────────────────────────────────────────────

function _round(x, sig = 8) {
    if (typeof x !== 'number' || !isFinite(x)) return x;
    if (x === 0) return 0;
    // parseFloat(toPrecision) is a single VM intrinsic — avoids two
    // transcendental calls (log10 + pow) used in the previous implementation.
    return parseFloat(x.toPrecision(sig));
}
function _roundMatrix(M) { return M.map(row => row.map(x => _round(x))); }
function _lorentz(beta) {
    if (Math.abs(beta) >= 1) throw new Error('Speed must be less than c (|beta| < 1)');
    return 1 / Math.sqrt(1 - beta * beta);
}
function _parseMat(x) { return typeof x === 'string' ? JSON.parse(x) : x; }
function _shape(A) { return [A.length, A[0].length]; }
function _norm(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }

// ══════════════════════════════════════════════════════════════════════════════
// PARTICLE PHYSICS
// ══════════════════════════════════════════════════════════════════════════════

export function particlePhysics(params) {
    const { mode } = params;

    switch (mode) {
        case 'lorentz_factor': {
            const beta = params.beta !== undefined
                ? Number(params.beta)
                : Number(params.v) / C;
            const gamma = _lorentz(beta);
            return { beta: _round(beta,10), v_ms: _round(beta*C), gamma: _round(gamma,10), note: 'gamma = 1/sqrt(1-beta^2)' };
        }

        case 'rest_energy': {
            const m = Number(params.mass_kg ?? params.m);
            const E = m * C * C;
            return { mass_kg: m, E_J: _round(E), E_eV: _round(E/EV), E_MeV: _round(E/EV/1e6), E_GeV: _round(E/EV/1e9), note: 'E = mc^2' };
        }

        case 'relativistic_energy': {
            const m = Number(params.mass_kg ?? params.m);
            const beta = params.beta !== undefined ? Number(params.beta) : Number(params.v) / C;
            const gamma = _lorentz(beta);
            const Er = m*C*C, Et = gamma*m*C*C, KE = (gamma-1)*m*C*C;
            return {
                mass_kg: m, beta: _round(beta,10), gamma: _round(gamma,10),
                E_rest_J: _round(Er),   E_rest_MeV:  _round(Er/EV/1e6),
                E_total_J: _round(Et),  E_total_MeV: _round(Et/EV/1e6),
                KE_J: _round(KE),       KE_MeV:      _round(KE/EV/1e6),
                note: 'E_total = gamma*mc^2, KE = (gamma-1)*mc^2'
            };
        }

        case 'relativistic_momentum': {
            const m = Number(params.mass_kg ?? params.m);
            const beta = params.beta !== undefined ? Number(params.beta) : Number(params.v) / C;
            const gamma = _lorentz(beta);
            const p = gamma * m * beta * C;
            return { mass_kg: m, beta: _round(beta,10), gamma: _round(gamma,10), momentum_kg_ms: _round(p), momentum_MeV_c: _round(p*C/EV/1e6), note: 'p = gamma*mv' };
        }

        case 'energy_momentum_relation': {
            const hasE = params.E_MeV !== undefined, hasP = params.p_MeV_c !== undefined, hasM = params.m_MeV_c2 !== undefined;
            const E = hasE ? Number(params.E_MeV) : null;
            const p = hasP ? Number(params.p_MeV_c) : null;
            const mc2 = hasM ? Number(params.m_MeV_c2) : null;
            if (hasE && hasP) return { E_MeV: E, p_MeV_c: p, m_MeV_c2: _round(Math.sqrt(Math.max(0, E*E-p*p))), note: 'E^2 = (pc)^2 + (mc^2)^2' };
            if (hasE && hasM) return { E_MeV: E, p_MeV_c: _round(Math.sqrt(Math.max(0, E*E-mc2*mc2))), m_MeV_c2: mc2, note: 'E^2 = (pc)^2 + (mc^2)^2' };
            if (hasP && hasM) return { E_MeV: _round(Math.sqrt(p*p+mc2*mc2)), p_MeV_c: p, m_MeV_c2: mc2, note: 'E^2 = (pc)^2 + (mc^2)^2' };
            throw new Error('Provide any two of: E_MeV, p_MeV_c, m_MeV_c2');
        }

        case 'debroglie': {
            let p;
            if (params.p_kg_ms !== undefined)                                           p = Number(params.p_kg_ms);
            else if (params.mass_kg !== undefined && params.v !== undefined)            p = Number(params.mass_kg) * Number(params.v);
            else if (params.KE_eV !== undefined && params.mass_kg !== undefined)        p = Math.sqrt(2 * Number(params.mass_kg) * Number(params.KE_eV) * EV);
            else throw new Error('Provide p_kg_ms, or (mass_kg + v), or (mass_kg + KE_eV)');
            const lam = H / p;
            return { momentum_kg_ms: _round(p), wavelength_m: _round(lam), wavelength_nm: _round(lam*1e9), wavelength_pm: _round(lam*1e12), wavelength_angstrom: _round(lam*1e10), note: 'lambda = h/p' };
        }

        case 'compton': {
            const theta_deg = Number(params.theta_deg ?? params.angle_deg ?? 90);
            if (theta_deg < 0 || theta_deg > 360) throw new Error('theta_deg must be in [0, 360]');
            const theta_rad = theta_deg * Math.PI / 180;
            const lamC = H / (M_E * C);
            const dLam = lamC * (1 - Math.cos(theta_rad));
            const lamI = params.lambda_i_m ? Number(params.lambda_i_m) : 0;
            return {
                compton_wavelength_pm: _round(lamC*1e12), theta_deg,
                delta_lambda_pm: _round(dLam*1e12),
                ...(lamI ? { incident_pm: _round(lamI*1e12), scattered_pm: _round((lamI+dLam)*1e12) } : {}),
                note: 'Delta_lambda = (h/m_e*c)(1 - cos(theta))'
            };
        }

        case 'photoelectric': {
            let Eph;
            if      (params.f_Hz !== undefined)       Eph = H * Number(params.f_Hz);
            else if (params.lambda_m !== undefined)   Eph = H*C / Number(params.lambda_m);
            else if (params.lambda_nm !== undefined)  Eph = H*C / (Number(params.lambda_nm)*1e-9);
            else if (params.E_eV !== undefined)       Eph = Number(params.E_eV)*EV;
            else throw new Error('Provide f_Hz, lambda_m, lambda_nm, or E_eV');
            const phi = Number(params.work_function_eV ?? params.phi_eV ?? 0) * EV;
            const KE  = Eph - phi;
            const thresholdFields = phi > 0
                ? { threshold_freq_Hz: _round(phi/H), threshold_lambda_nm: _round(H*C/phi*1e9) }
                : { threshold_freq_Hz: null, threshold_lambda_nm: null, note_threshold: 'Work function is 0; threshold is undefined' };
            return {
                photon_energy_eV: _round(Eph/EV), work_function_eV: _round(phi/EV),
                KE_max_eV: _round(KE/EV), electron_ejected: KE > 0,
                ...thresholdFields,
                note: 'KE_max = hf - phi'
            };
        }

        case 'decay': {
            let lambdaD, tHalf;
            if (params.half_life_s !== undefined)       { tHalf = Number(params.half_life_s);    lambdaD = Math.LN2 / tHalf; }
            else if (params.decay_constant !== undefined) { lambdaD = Number(params.decay_constant); tHalf = Math.LN2 / lambdaD; }
            else throw new Error('Provide half_life_s or decay_constant');
            const N0 = Number(params.N0 ?? params.initial ?? 1);
            const t  = Number(params.t  ?? params.time_s  ?? 0);
            const N  = N0 * Math.exp(-lambdaD * t);
            return {
                decay_constant_per_s: _round(lambdaD), half_life_s: _round(tHalf), mean_lifetime_s: _round(1/lambdaD),
                N0, t_s: t, N_remaining: _round(N), fraction_remaining: _round(N/N0),
                percent_decayed: _round((1-N/N0)*100), activity_Bq: _round(lambdaD*N),
                note: 'N(t) = N0 * exp(-lambda*t)'
            };
        }

        case 'uncertainty': {
            const type = params.type ?? 'position_momentum';
            if (type === 'position_momentum') {
                if (params.delta_x !== undefined) return { delta_x_m: Number(params.delta_x), delta_p_min: _round(HBAR/(2*Number(params.delta_x))), relation: 'dx*dp >= hbar/2' };
                if (params.delta_p !== undefined) return { delta_p: Number(params.delta_p), delta_x_min_m: _round(HBAR/(2*Number(params.delta_p))), relation: 'dx*dp >= hbar/2' };
            } else if (type === 'energy_time') {
                if (params.delta_t !== undefined) { const dE = HBAR/(2*Number(params.delta_t)); return { delta_t_s: Number(params.delta_t), delta_E_min_J: _round(dE), delta_E_min_eV: _round(dE/EV), relation: 'dE*dt >= hbar/2' }; }
                if (params.delta_E_eV !== undefined) { const dE = Number(params.delta_E_eV)*EV; return { delta_E_eV: Number(params.delta_E_eV), delta_t_min_s: _round(HBAR/(2*dE)), relation: 'dE*dt >= hbar/2' }; }
            }
            throw new Error('Provide type (position_momentum or energy_time) and one uncertainty value');
        }

        default:
            throw new Error(`Unknown physics mode: "${mode}". Options: lorentz_factor, rest_energy, relativistic_energy, relativistic_momentum, energy_momentum_relation, debroglie, compton, photoelectric, decay, uncertainty`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SPECIAL / GENERAL RELATIVITY
// ══════════════════════════════════════════════════════════════════════════════

export function relativityCalc(params) {
    const { mode } = params;

    switch (mode) {
        case 'time_dilation': {
            const beta = params.beta !== undefined ? Number(params.beta) : Number(params.v)/C;
            const gamma = _lorentz(beta);
            const t0 = Number(params.proper_time_s ?? params.t0 ?? 1);
            return { beta: _round(beta,10), gamma: _round(gamma,10), proper_time_s: _round(t0), dilated_time_s: _round(gamma*t0), note: "t' = gamma*t0" };
        }

        case 'length_contraction': {
            const beta = params.beta !== undefined ? Number(params.beta) : Number(params.v)/C;
            const gamma = _lorentz(beta);
            const L0 = Number(params.proper_length_m ?? params.L0 ?? 1);
            return { beta: _round(beta,10), gamma: _round(gamma,10), proper_length_m: _round(L0), contracted_length_m: _round(L0/gamma), note: 'L = L0/gamma' };
        }

        case 'velocity_addition': {
            const v = Number(params.v), w = Number(params.w);
            const u = (v + w) / (1 + v*w/(C*C));
            return { v_ms: v, v_beta: _round(v/C,10), w_ms: w, w_beta: _round(w/C,10), u_ms: _round(u), u_beta: _round(u/C,10), note: 'u = (v+w)/(1+vw/c^2)' };
        }

        case 'lorentz_boost': {
            const v = Number(params.v);
            const gamma = _lorentz(v/C);
            const t = Number(params.t ?? 0), x = Number(params.x ?? 0);
            const y = Number(params.y ?? 0), z = Number(params.z ?? 0);
            return {
                beta: _round(v/C,10), gamma: _round(gamma,10),
                original: { t, x, y, z },
                boosted:  { t: _round(gamma*(t - v*x/(C*C))), x: _round(gamma*(x - v*t)), y, z },
                spacetime_interval: _round(C*C*t*t - x*x - y*y - z*z),
                note: 'Lorentz boost along x-axis'
            };
        }

        case 'doppler': {
            const beta  = params.beta !== undefined ? Number(params.beta) : Number(params.v)/C;
            const f_src = Number(params.f_source_Hz ?? params.freq ?? 1);
            const ratio = Math.sqrt((1 - beta) / (1 + beta));
            const f_obs = f_src * ratio;
            return {
                beta: _round(beta,10), f_source_Hz: _round(f_src), f_observed_Hz: _round(f_obs),
                redshift_z: _round((f_src - f_obs)/f_obs), effect: beta > 0 ? 'recession (redshift)' : 'approach (blueshift)',
                note: "f_obs = f_src * sqrt((1-beta)/(1+beta))"
            };
        }

        case 'schwarzschild_radius': {
            const M  = Number(params.mass_kg ?? params.M);
            const rs = 2 * G * M / (C*C);
            return { mass_kg: M, mass_solar: _round(M/1.989e30), schwarzschild_radius_m: _round(rs), schwarzschild_radius_km: _round(rs/1000), note: 'rs = 2GM/c^2' };
        }

        case 'gravitational_time_dilation': {
            const M  = Number(params.mass_kg ?? params.M);
            const r  = Number(params.r_m ?? params.r);
            const rs = 2*G*M/(C*C);
            if (r <= rs) throw new Error(`r must be outside the Schwarzschild radius (rs = ${_round(rs)} m)`);
            const factor = Math.sqrt(1 - rs/r);
            return { mass_kg: M, r_m: r, r_s_m: _round(rs), time_rate_vs_infinity: _round(factor,10), clock_runs_slower_by: _round(1/factor,10), note: 'dt_proper/dt_coord = sqrt(1 - rs/r)' };
        }

        default:
            throw new Error(`Unknown relativity mode: "${mode}". Options: time_dilation, length_contraction, velocity_addition, lorentz_boost, doppler, schwarzschild_radius, gravitational_time_dilation`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// LINEAR ALGEBRA  (pure JS, partial pivoting, no external deps)
// ══════════════════════════════════════════════════════════════════════════════

function _matMul(A, B) {
    const [ra, ca] = _shape(A), [rb, cb] = _shape(B);
    if (ca !== rb) throw new Error(`Incompatible dimensions (${ra}x${ca}) x (${rb}x${cb})`);
    // Plain triple loop — no sparsity guard. For the small dense matrices
    // physics tools receive (2x2–6x6) the branch itself costs more than the
    // multiply it would skip.
    const C = Array.from({ length: ra }, () => new Float64Array(cb));
    for (let i = 0; i < ra; i++) {
        const Ai = A[i];
        for (let k = 0; k < ca; k++) {
            const Aik = Ai[k];
            const Bk  = B[k];
            const Ci  = C[i];
            for (let j = 0; j < cb; j++) Ci[j] += Aik * Bk[j];
        }
    }
    return Array.from(C, row => Array.from(row));
}

function _transpose(A) {
    const [r, c] = _shape(A);
    return Array.from({ length: c }, (_, j) => Array.from({ length: r }, (_, i) => A[i][j]));
}

function _det(A) {
    const n = A.length;
    if (n === 1) return A[0][0];
    const U = A.map(r => [...r]);
    let sign = 1;
    for (let k = 0; k < n; k++) {
        let maxR = k;
        for (let r = k+1; r < n; r++) if (Math.abs(U[r][k]) > Math.abs(U[maxR][k])) maxR = r;
        if (maxR !== k) { [U[k], U[maxR]] = [U[maxR], U[k]]; sign *= -1; }
        if (Math.abs(U[k][k]) < 1e-14) return 0;
        for (let r = k+1; r < n; r++) { const f = U[r][k]/U[k][k]; for (let j = k; j < n; j++) U[r][j] -= f*U[k][j]; }
    }
    let d = sign;
    for (let i = 0; i < n; i++) d *= U[i][i];
    return d;
}

function _inverse(A) {
    const n = A.length;
    const M = A.map((row, i) => { const e = new Array(n).fill(0); e[i] = 1; return [...row, ...e]; });
    for (let c = 0; c < n; c++) {
        let maxR = c;
        for (let r = c+1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[maxR][c])) maxR = r;
        [M[c], M[maxR]] = [M[maxR], M[c]];
        const piv = M[c][c];
        if (Math.abs(piv) < 1e-14) throw new Error('Matrix is singular (non-invertible)');
        for (let j = 0; j < 2*n; j++) M[c][j] /= piv;
        for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c]; for (let j = 0; j < 2*n; j++) M[r][j] -= f*M[c][j]; }
    }
    return M.map(row => row.slice(n));
}

function _solve(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
        let maxR = c;
        for (let r = c+1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[maxR][c])) maxR = r;
        [M[c], M[maxR]] = [M[maxR], M[c]];
        if (Math.abs(M[c][c]) < 1e-12) throw new Error('No unique solution (singular matrix)');
        const piv = M[c][c];
        for (let j = c; j <= n; j++) M[c][j] /= piv;
        for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c]; for (let j = c; j <= n; j++) M[r][j] -= f*M[c][j]; }
    }
    return M.map(row => row[n]);
}

function _rank(A) {
    const [rows, cols] = _shape(A);
    const M = A.map(r => [...r]);
    let rank = 0, col = 0;
    for (let row = 0; row < rows && col < cols; col++) {
        let pivRow = -1;
        for (let r = row; r < rows; r++) if (Math.abs(M[r][col]) > 1e-9) { pivRow = r; break; }
        if (pivRow === -1) continue;
        [M[row], M[pivRow]] = [M[pivRow], M[row]];
        rank++;
        const piv = M[row][col];
        for (let j = col; j < cols; j++) M[row][j] /= piv;
        for (let r = 0; r < rows; r++) { if (r === row) continue; const f = M[r][col]; for (let j = col; j < cols; j++) M[r][j] -= f*M[row][j]; }
        row++;
    }
    return rank;
}

// Modified Gram-Schmidt QR decomposition.
// Compared to classical GS, MGS orthogonalises against already-projected
// basis vectors (v is updated in-place each inner step) rather than against
// the original column. Same O(n²m) cost, but dramatically better numerical
// stability — avoids catastrophic cancellation in nearly-dependent columns.
function _qr(A) {
    const [m, n] = _shape(A);
    // Work on column copies so we can orthogonalise in-place.
    const vs = Array.from({ length: n }, (_, j) => A.map(row => row[j]));
    const R  = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
        // Orthogonalise vs[j] against all previous basis vectors in order.
        for (let i = 0; i < j; i++) {
            let dot = 0;
            for (let k = 0; k < m; k++) dot += vs[i][k] * vs[j][k]; // vs[i] already normalised
            R[i][j] = dot;
            for (let k = 0; k < m; k++) vs[j][k] -= dot * vs[i][k];
        }
        // Normalise.
        const nrm = _norm(vs[j]);
        R[j][j] = nrm;
        if (nrm > 1e-14) for (let k = 0; k < m; k++) vs[j][k] /= nrm;
    }
    // Assemble Q from the (now orthonormal) column vectors.
    const Q = Array.from({ length: m }, (_, i) => vs.map(col => col[i]));
    return { Q, R };
}

// QR iteration with Wilkinson shift and sub-diagonal convergence guard.
// Early exit cuts typical iteration count from 300 → 20–40 for
// well-conditioned matrices, saving O(n³ × (300 - actual_iters)) work.
function _eigenvaluesQR(A, maxIter = 300) {
    const n = A.length;
    let Ak = A.map(r => [...r]);
    for (let it = 0; it < maxIter; it++) {
        // Wilkinson shift using bottom-right element
        const shift = Ak[n-1][n-1];
        for (let i = 0; i < n; i++) Ak[i][i] -= shift;
        const { Q, R } = _qr(Ak);
        Ak = _matMul(R, Q);
        for (let i = 0; i < n; i++) Ak[i][i] += shift;
        // Convergence check: exit when all sub-diagonal elements are negligible.
        let offDiagSum = 0;
        for (let i = 1; i < n; i++) offDiagSum += Math.abs(Ak[i][i-1]);
        if (offDiagSum < 1e-10) break;
    }
    return Array.from({ length: n }, (_, i) => ({ re: Ak[i][i], im: 0 }));
}

function _eig2(A) {
    const tr = A[0][0]+A[1][1], det = A[0][0]*A[1][1]-A[0][1]*A[1][0], disc = tr*tr-4*det;
    if (disc < 0) { const re=tr/2, im=Math.sqrt(-disc)/2; return [{re,im},{re,im:-im}]; }
    const sq = Math.sqrt(disc);
    return [{re:(tr+sq)/2,im:0},{re:(tr-sq)/2,im:0}];
}

function _cross3(a, b) {
    if (a.length !== 3 || b.length !== 3) throw new Error('Cross product requires 3D vectors');
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}

function _frob(A) { return Math.sqrt(A.reduce((s,r) => s+r.reduce((t,x) => t+x*x,0), 0)); }

export function linAlg(params) {
    const { mode } = params;
    const A = params.A ? _parseMat(params.A) : null;
    const B = params.B ? _parseMat(params.B) : null;
    const b = params.b ? _parseMat(params.b) : null;
    const v = params.v ? _parseMat(params.v) : null;
    const w = params.w ? _parseMat(params.w) : null;

    switch (mode) {
        case 'multiply': {
            if (!A||!B) throw new Error('Provide A and B');
            const R = _matMul(A, B); return { result: _roundMatrix(R), shape: _shape(R) };
        }
        case 'determinant': {
            if (!A) throw new Error('Provide A');
            const [r,c] = _shape(A); if (r!==c) throw new Error('Determinant requires square matrix');
            return { determinant: _round(_det(A)) };
        }
        case 'inverse': {
            if (!A) throw new Error('Provide A');
            const [r,c] = _shape(A); if (r!==c) throw new Error('Inverse requires square matrix');
            return { inverse: _roundMatrix(_inverse(A)) };
        }
        case 'eigenvalues': {
            if (!A) throw new Error('Provide A');
            const [r,c] = _shape(A); if (r!==c) throw new Error('Eigenvalues require square matrix');
            const raw = r===2 ? _eig2(A) : _eigenvaluesQR(A, 300);
            return {
                eigenvalues: raw.map(e => Math.abs(e.im) < 1e-7
                    ? { value: _round(e.re), type: 'real' }
                    : { re: _round(e.re), im: _round(e.im), type: 'complex' }),
                trace: _round(A.reduce((s,row,i) => s+row[i], 0)),
                determinant: _round(_det(A)),
                note: r > 2 ? 'Numerical QR iteration' : 'Exact (quadratic)'
            };
        }
        case 'solve': {
            if (!A||!b) throw new Error('Provide A matrix and b vector');
            // Flatten b if the model passes it as a column vector [[x],[y],[z]]
            const bFlat = Array.isArray(b[0]) ? b.map(row => row[0]) : b;
            return { x: _solve(A, bFlat).map(xi => _round(xi)), note: 'Gaussian elimination with partial pivoting' };
        }
        case 'transpose': { if (!A) throw new Error('Provide A'); return { transpose: _roundMatrix(_transpose(A)) }; }
        case 'rank':      { if (!A) throw new Error('Provide A'); return { rank: _rank(A), shape: _shape(A) }; }
        case 'dot': {
            if (!v||!w) throw new Error('Provide v and w');
            // Flatten column vectors ([[a],[b],[c]]) or row vectors ([[a,b,c]])
            const vFlat = (Array.isArray(v[0]) && v[0].length === 1) ? v.map(r => r[0]) : (Array.isArray(v[0]) ? v[0] : v);
            const wFlat = (Array.isArray(w[0]) && w[0].length === 1) ? w.map(r => r[0]) : (Array.isArray(w[0]) ? w[0] : w);
            if (vFlat.length !== wFlat.length) throw new Error('Vectors must be equal length');
            const dot = vFlat.reduce((s,x,i) => s+x*wFlat[i], 0);
            const nv = _norm(vFlat), nw = _norm(wFlat);
            const zeroVec = nv < 1e-15 || nw < 1e-15;
            return {
                dot_product: _round(dot), v_norm: _round(nv), w_norm: _round(nw),
                cos_angle:  zeroVec ? null : _round(dot/(nv*nw)),
                angle_deg:  zeroVec ? null : _round(Math.acos(Math.max(-1,Math.min(1,dot/(nv*nw))))*180/Math.PI),
                ...(zeroVec ? { note: 'Angle undefined: one or both vectors are zero' } : {})
            };
        }
        case 'cross': {
            if (!v||!w) throw new Error('Provide v and w (3D)');
            const c = _cross3(v, w); return { cross_product: c.map(x => _round(x)), magnitude: _round(_norm(c)) };
        }
        case 'norm':  { if (v) return { norm: _round(_norm(v)), type: 'L2' }; if (A) return { frobenius_norm: _round(_frob(A)) }; throw new Error('Provide v or A'); }
        case 'trace': {
            if (!A) throw new Error('Provide A');
            const [r,c] = _shape(A); if (r!==c) throw new Error('Trace requires square matrix');
            return { trace: _round(A.reduce((s,row,i) => s+row[i], 0)) };
        }
        default:
            throw new Error(`Unknown linalg mode: "${mode}". Options: multiply, determinant, inverse, eigenvalues, solve, transpose, rank, dot, cross, norm, trace`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// DIFFERENTIAL EQUATIONS
// ══════════════════════════════════════════════════════════════════════════════

function _parseExpr(expr, args) {
    const safe = expr
        .replace(/\bpi\b/gi, 'Math.PI').replace(/\be\b(?!\w)/g, 'Math.E')
        .replace(/\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sqrt|cbrt|abs|exp|log|log2|log10|pow|sign)\b/g, 'Math.$1')
        .replace(/\bln\b/g, 'Math.log').replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    return new Function(...args, `"use strict"; return (${safe});`);
}

function _rnd(x, s=6) { return _round(x, s); }
function _every(steps, maxPts=80) { return Math.max(1, Math.floor(steps/maxPts)); }

export function diffEq(params) {
    const { mode } = params;

    switch (mode) {
        case 'euler': {
            const f = _parseExpr(params.f ?? params.expr, ['x','y']);
            const x0=Number(params.x0??0), y0=Number(params.y0??params.initial??1), x_end=Number(params.x_end??params.xf??1);
            const steps=Math.min(Number(params.steps??200),20000), h=(x_end-x0)/steps;
            const pts=[], ev=_every(steps); let x=x0, y=y0;
            for (let i=0;i<=steps;i++) {
                if (i%ev===0||i===steps) pts.push({x:_rnd(x),y:_rnd(y)});
                if (i<steps) { y+=h*f(x,y); x+=h; }
            }
            return { method:'Euler', f:params.f??params.expr, x0,y0,x_end,steps, h:_round(h,8), final_y:_round(y,8), sample_points:pts };
        }

        case 'rk4': {
            const f = _parseExpr(params.f ?? params.expr, ['x','y']);
            const x0=Number(params.x0??0), y0=Number(params.y0??params.initial??1), x_end=Number(params.x_end??params.xf??1);
            const steps=Math.min(Number(params.steps??200),20000), h=(x_end-x0)/steps;
            const pts=[], ev=_every(steps); let x=x0, y=y0;
            for (let i=0;i<=steps;i++) {
                if (i%ev===0||i===steps) pts.push({x:_rnd(x),y:_rnd(y)});
                if (i<steps) {
                    const k1=f(x,y), k2=f(x+h/2,y+h*k1/2), k3=f(x+h/2,y+h*k2/2), k4=f(x+h,y+h*k3);
                    y+=(h/6)*(k1+2*k2+2*k3+k4); x+=h;
                }
            }
            return { method:'RK4', f:params.f??params.expr, x0,y0,x_end,steps, h:_round(h,8), final_y:_round(y,8), sample_points:pts };
        }

        case 'system_rk4': {
            const f = _parseExpr(params.f, ['x','y','z']);
            const g = _parseExpr(params.g, ['x','y','z']);
            const x0=Number(params.x0??0), y0=Number(params.y0??1), z0=Number(params.z0??0), x_end=Number(params.x_end??params.xf??1);
            const steps=Math.min(Number(params.steps??200),20000), h=(x_end-x0)/steps;
            const pts=[], ev=_every(steps); let x=x0, y=y0, z=z0;
            for (let i=0;i<=steps;i++) {
                if (i%ev===0||i===steps) pts.push({x:_rnd(x),y:_rnd(y),z:_rnd(z)});
                if (i<steps) {
                    const k1y=f(x,y,z),        k1z=g(x,y,z);
                    const k2y=f(x+h/2,y+h*k1y/2,z+h*k1z/2), k2z=g(x+h/2,y+h*k1y/2,z+h*k1z/2);
                    // Stage 3 must use k2y AND k2z for both components (was incorrectly cross-mixing k1/k2)
                    const k3y=f(x+h/2,y+h*k2y/2,z+h*k2z/2), k3z=g(x+h/2,y+h*k2y/2,z+h*k2z/2);
                    const k4y=f(x+h,  y+h*k3y,  z+h*k3z),   k4z=g(x+h,  y+h*k3y,  z+h*k3z);
                    y+=(h/6)*(k1y+2*k2y+2*k3y+k4y); z+=(h/6)*(k1z+2*k2z+2*k3z+k4z); x+=h;
                }
            }
            return { method:'RK4 system', x0,x_end,steps, initial:{y:y0,z:z0}, final:{y:_round(y,8),z:_round(z,8)}, sample_points:pts };
        }

        case 'second_order_const': {
            // a*y'' + b*y' + c*y = 0
            const a=Number(params.a??1), b=Number(params.b??0), cc=Number(params.c??0);
            const disc = b*b - 4*a*cc;
            let solution_type, roots, general_solution;
            if (Math.abs(disc) < 1e-10) {
                const lam = -b/(2*a); solution_type='repeated_real'; roots=[{re:_round(lam),im:0}];
                general_solution=`y = (C1 + C2*x)*exp(${_round(lam)}*x)`;
            } else if (disc > 0) {
                const sq=Math.sqrt(disc), l1=(-b+sq)/(2*a), l2=(-b-sq)/(2*a);
                solution_type='distinct_real'; roots=[{re:_round(l1),im:0},{re:_round(l2),im:0}];
                general_solution=`y = C1*exp(${_round(l1)}*x) + C2*exp(${_round(l2)}*x)`;
            } else {
                const alpha=-b/(2*a), betaV=Math.sqrt(-disc)/(2*a);
                solution_type='complex_conjugate'; roots=[{re:_round(alpha),im:_round(betaV)},{re:_round(alpha),im:-_round(betaV)}];
                general_solution=`y = exp(${_round(alpha)}*x)*[C1*cos(${_round(betaV)}*x) + C2*sin(${_round(betaV)}*x)]`;
            }
            let particular = null;
            if (params.y0 !== undefined && params.yp0 !== undefined) {
                const y0v=Number(params.y0), yp0v=Number(params.yp0);
                if (solution_type==='distinct_real') {
                    const [l1,l2]=roots; const C1=(yp0v-y0v*l2.re)/(l1.re-l2.re), C2=y0v-C1;
                    particular=`y = ${_round(C1)}*exp(${_round(l1.re)}*x) + ${_round(C2)}*exp(${_round(l2.re)}*x)`;
                } else if (solution_type==='repeated_real') {
                    const lam=roots[0].re, C1=y0v, C2=yp0v-lam*y0v;
                    particular=`y = (${_round(C1)} + ${_round(C2)}*x)*exp(${_round(lam)}*x)`;
                } else {
                    const alpha=roots[0].re, betaV=roots[0].im, C1=y0v, C2=(yp0v-alpha*C1)/betaV;
                    particular=`y = exp(${_round(alpha)}*x)*[${_round(C1)}*cos(${_round(betaV)}*x) + ${_round(C2)}*sin(${_round(betaV)}*x)]`;
                }
            }
            return {
                equation:`${a}y'' + ${b}y' + ${cc}y = 0`, discriminant:_round(disc),
                solution_type, characteristic_roots:roots, general_solution,
                ...(particular ? {particular_solution:particular, IVP:`y(0)=${params.y0}, y'(0)=${params.yp0}`} : {})
            };
        }

        case 'linear_first_order': {
            // dy/dx + P*y = Q  (constant P, Q)
            const P=Number(params.P??0), Q=Number(params.Q??0), x0=Number(params.x0??0);
            if (Math.abs(P) < 1e-12) {
                let particular=null;
                if (params.y0!==undefined) { const C=Number(params.y0)-Q*x0; particular=`y = ${Q}*x + ${_round(C)}`; }
                return { equation:`dy/dx = ${Q}`, general_solution:`y = ${Q}*x + C`, ...(particular?{particular_solution:particular}:{}) };
            }
            const eq=_round(Q/P), general=`y = ${eq} + C*exp(${_round(-P)}*x)`;
            let particular=null;
            if (params.y0!==undefined) {
                const C=(Number(params.y0)-Q/P)*Math.exp(P*x0);
                particular=`y = ${eq} + ${_round(C)}*exp(${_round(-P)}*x)`;
            }
            return {
                equation:`dy/dx + ${P}*y = ${Q}`, integrating_factor:`exp(${P}*x)`,
                equilibrium_solution:`y* = ${eq}`, general_solution:general,
                ...(particular?{particular_solution:particular, IVP:`y(${x0})=${params.y0}`}:{})
            };
        }

        default:
            throw new Error(`Unknown diffeq mode: "${mode}". Options: euler, rk4, system_rk4, second_order_const, linear_first_order`);
    }
}
