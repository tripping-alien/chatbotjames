module.exports = [
    {
        ignores: ["*.html", "*.css", "*.md", "eslint.config.js"]
    },
    {
        files: ["*.js"],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module",
            globals: {
                window: "readonly", document: "readonly", console: "readonly", fetch: "readonly",
                navigator: "readonly", self: "readonly", postMessage: "readonly", setTimeout: "readonly",
                setInterval: "readonly", clearTimeout: "readonly", clearInterval: "readonly",
                Math: "readonly", localStorage: "readonly", URL: "readonly", Blob: "readonly",
                JSON: "readonly", btoa: "readonly", atob: "readonly", importScripts: "readonly",
                crypto: "readonly", IntersectionObserver: "readonly", DOMParser: "readonly",
                requestAnimationFrame: "readonly", FileReader: "readonly", caches: "readonly",
                Response: "readonly", Request: "readonly", Notification: "readonly",
                AbortController: "readonly", Worker: "readonly", matchMedia: "readonly",
                WebAssembly: "readonly", OffscreenCanvas: "readonly"
            }
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": "warn",
            "no-unreachable": "error"
        }
    }
];
