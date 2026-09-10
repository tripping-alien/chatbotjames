const initWebGLBackground = () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'webgl-bg';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';
    document.body.appendChild(canvas);

    const gl = canvas.getContext('webgl');
    if (!gl) return; // Fallback silently if WebGL is not supported

    const vertexShaderSource = `
        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    // Cyberpunk perspective grid shader
    const fragmentShaderSource = `
        precision highp float;
        uniform vec2 u_resolution;
        uniform float u_time;

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            uv = uv * 2.0 - 1.0;
            uv.x *= u_resolution.x / u_resolution.y;

            // Base dark background
            vec3 bgColor = vec3(0.02, 0.035, 0.075); // Dark blue-gray

            // Move the horizon line up a bit
            float y = uv.y + 0.3;
            
            // Render the grid on the floor
            vec3 color = bgColor;
            if (y < 0.0) {
                float z = 1.0 / abs(y);
                vec2 floorUV = vec2(uv.x * z, z - u_time * 1.5);
                
                vec2 grid = abs(fract(floorUV * 2.0) - 0.5);
                float line = smoothstep(0.4, 0.45, max(grid.x, grid.y));
                
                // Fade into the distance
                float depthFade = exp(-z * 0.15);
                vec3 gridColor = vec3(0.0, 0.95, 1.0) * line * depthFade * 0.15; // Cyan lines
                
                color += gridColor;
            }

            // Render a faint matrix rain/noise on the top half.
            // NOTE: mod() clamps the sin() input to [0, 2π] before the large multiplier
            // to prevent NaN/Inf on Nvidia GPUs where sin() of large values may overflow.
            if (y >= 0.0) {
                float sinInput = mod(dot(uv.xy + u_time * 0.1, vec2(12.9898, 78.233)), 6.2831853);
                float noise = fract(sin(sinInput) * 43758.5453);
                color += vec3(0.0, 1.0, 0.4) * noise * 0.015;
            }

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        return;
    }

    // IMPORTANT: useProgram MUST come before resize() so that gl.uniform2f calls
    // inside resize() actually reach the active program. On Nvidia drivers, calling
    // uniform setters with no active program is a silent no-op, breaking u_resolution.
    gl.useProgram(program);

    // Fullscreen quad
    const vertices = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');

    let startTime = Date.now();

    function resize() {
        // Adjust for device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
    }

    window.addEventListener('resize', resize);
    resize();

    function render() {
        const time = (Date.now() - startTime) / 1000.0;
        gl.uniform1f(timeLoc, time);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestAnimationFrame(render);
    }
    
    render();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWebGLBackground);
} else {
    initWebGLBackground();
}
