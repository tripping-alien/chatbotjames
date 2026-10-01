/**
 * tools-art.js — Pure-JS generative art and visual tools for JAMES tools-worker.
 * No external dependencies. Runs inside a Web Worker.
 *
 * Exports: generateSprite
 */

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return hash;
}

function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateSprite(params) {
    const seedString = params.seed ? String(params.seed) : Math.random().toString(36).substring(2, 10);
    const rng = mulberry32(hashString(seedString));

    const size = Math.min(Math.max(parseInt(params.grid_size) || 8, 4), 32); // clamp between 4 and 32
    const symmetry = params.symmetry || 'vertical'; // vertical, horizontal, both, none
    const scale = parseInt(params.scale) || 10; // Pixel size in SVG

    // Random vibrant color if none provided
    const color = params.color && params.color !== 'random' 
        ? params.color 
        : hslToHex(rng() * 360, 70 + rng() * 30, 50 + rng() * 10);
    
    const bgColor = params.bg_color || 'transparent';

    const grid = Array(size).fill(0).map(() => Array(size).fill(0));

    // Fill grid
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let active = rng() > 0.5 ? 1 : 0;

            // Apply symmetry
            if (symmetry === 'vertical' && x >= Math.ceil(size / 2)) {
                active = grid[y][size - 1 - x];
            } else if (symmetry === 'horizontal' && y >= Math.ceil(size / 2)) {
                active = grid[size - 1 - y][x];
            } else if (symmetry === 'both') {
                if (x >= Math.ceil(size / 2)) active = grid[y][size - 1 - x];
                if (y >= Math.ceil(size / 2)) active = grid[size - 1 - y][x];
            }

            grid[y][x] = active;
        }
    }

    // Build SVG
    const svgWidth = size * scale;
    const svgHeight = size * scale;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`;
    
    if (bgColor !== 'transparent') {
        svg += `<rect width="${svgWidth}" height="${svgHeight}" fill="${bgColor}" />`;
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (grid[y][x]) {
                svg += `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${color}" />`;
            }
        }
    }
    
    svg += `</svg>`;

    // Base64 encode for markdown
    // Need to use btoa, but we must ensure we handle unicode characters properly if any (none in our pure SVG though)
    let b64;
    if (typeof btoa !== 'undefined') {
        b64 = btoa(svg);
    } else {
        b64 = Buffer.from(svg).toString('base64');
    }
    
    const dataUri = `data:image/svg+xml;base64,${b64}`;
    
    return {
        seed: seedString,
        grid_size: size,
        color: color,
        symmetry: symmetry,
        markdown_image: `![Retro Sprite - Seed: ${seedString}](${dataUri})`,
        note: 'Return the markdown_image string exactly as provided to render the art in the chat.'
    };
}
