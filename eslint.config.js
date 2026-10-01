module.exports = [
    {
        ignores: ["*.html", "*.css", "*.md"]
    },
    {
        files: ["*.js"],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                fetch: "readonly",
                navigator: "readonly",
                self: "readonly",
                postMessage: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                Math: "readonly",
                localStorage: "readonly",
                URL: "readonly",
                Blob: "readonly",
                JSON: "readonly",
                btoa: "readonly",
                atob: "readonly",
                importScripts: "readonly"
            }
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": "warn",
            "no-unreachable": "error"
        }
    }
];
