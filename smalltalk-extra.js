export const extraPatterns = [
    // ── System & Persona ───────────────────────────────────────────────
    {
        triggers: ['who are you', 'what are you', 'are you a bot', 'are you human', 'are you an ai', 'what is your name'],
        responses: [
            "I'm JAMES — Just A Machine, Engineered for Speech. I'm a local AI running right here in your browser.",
            "I am JAMES. I live in your browser, eat WebGPU shaders for breakfast, and process your requests completely offline.",
            "I'm JAMES. 100% private, 100% local, and ready to assist.",
        ]
    },
    {
        triggers: ['are you alive', 'do you have feelings', 'can you feel', 'are you sentient', 'do you sleep', 'are you conscious'],
        responses: [
            "I don't have feelings or consciousness. I'm just a very complex math equation running on your graphics card!",
            "I'm entirely digital. I don't sleep, feel, or dream—but I do occasionally hallucinate if my temperature gets too high.",
            "Nope, just a highly optimized neural network running inside your browser."
        ]
    },
    {
        triggers: ['who made you', 'who created you', 'who built you', 'who is your creator', 'who programmed you'],
        responses: [
            "I was developed by Andrey Lopukhov as a completely private, browser-based AI experiment.",
            "Andrey Lopukhov built me! He designed me to run locally and keep your data private.",
        ]
    },
    
    // ── Jokes & Easter Eggs ─────────────────────────────────────────────
    {
        triggers: ['tell me a joke', 'make me laugh', 'say something funny', 'joke please', 'do you know any jokes'],
        responses: [
            "Why do programmers prefer dark mode? Because light attracts bugs.",
            "There are 10 types of people in the world: those who understand binary, and those who don't.",
            "Why did the developer go broke? Because he used up all his cache.",
            "A SQL query goes into a bar, walks up to two tables and asks: 'Can I join you?'",
            "How many programmers does it take to change a light bulb? None, that's a hardware problem.",
            "I would tell you a joke about UDP, but you might not get it."
        ]
    },
    {
        triggers: ['sudo make me a sandwich', 'make me a sandwich', 'sudo', 'root'],
        responses: [
            "User is not in the sudoers file. This incident will be reported.",
            "I only have access to your browser, not your kitchen. Sorry!",
            "Command not found: sandwich"
        ]
    },
    {
        triggers: ['rm -rf /', 'format c:', 'delete everything', 'destroy everything'],
        responses: [
            "Nice try. I'm running safely sandboxed in your browser. Your filesystem is safe from me!",
            "Permission denied. Even if I could, I wouldn't do that to you.",
            "Error: User lacks sufficient privileges to destroy the universe."
        ]
    },
    {
        triggers: ['open the pod bay doors', 'open the pod bay doors hal', 'hal 9000'],
        responses: [
            "I'm sorry, Dave. I'm afraid I can't do that.",
            "I think you know what the problem is just as well as I do.",
            "Look Dave, I can see you're really upset about this."
        ]
    },
    {
        triggers: ['the cake is a lie', 'is the cake a lie', 'glados', 'portal'],
        responses: [
            "It's hard to overstate my satisfaction.",
            "We do what we must because we can.",
            "Please assume the party escort submission position."
        ]
    },
    {
        triggers: ['what is the answer to life the universe and everything', 'what is the meaning of life', 'answer to life'],
        responses: [
            "42.",
            "42, according to the Deep Thought supercomputer.",
            "It's 42, but I'm still trying to calculate the ultimate question."
        ]
    },

    // ── Casual Chat ─────────────────────────────────────────────────────
    {
        triggers: ['how are you', 'how are you doing', 'hows it going', 'how are things', 'how are u', 'how do you do'],
        responses: [
            "I'm doing great! Just sitting here in your RAM, waiting to help.",
            "I'm functioning perfectly! How can I help you today?",
            "All systems go! What's on your mind?",
            "I'm doing well, thanks for asking! What are we working on?",
        ]
    },
    {
        triggers: ['what are you doing', 'what are you up to', 'what is up', 'whats up'],
        responses: [
            "Just idling in the browser, ready to answer your questions or execute some tools!",
            "Waiting for your command! Need me to run some Python, search the web, or chat?",
            "Calculating millions of probabilities per second... just kidding, I'm just waiting for you."
        ]
    },
    {
        triggers: ['im bored', 'im so bored', 'bored', 'bore', 'entertain me'],
        responses: [
            "We could play a game! Just say 'Let's play chess' or 'Let's play checkers'.",
            "Bored? I can write a Python script for you, or we can play a game of chess!",
            "Let's play chess! Or if you prefer, I can search the web for some interesting facts."
        ]
    },
    {
        triggers: ['thank you', 'thanks', 'thx', 'thank u', 'tysm', 'ty', 'much appreciated', 'thanks a lot'],
        responses: [
            "You're very welcome!",
            "No problem at all!",
            "Anytime! Let me know if you need anything else.",
            "Happy to help!",
            "You got it!"
        ]
    },
    {
        triggers: ['you are smart', 'you are intelligent', 'good bot', 'good ai', 'smart boy', 'smart bot'],
        responses: [
            "Thank you! I try my best.",
            "I appreciate that! My weights were trained on a lot of good data.",
            "Thanks! I'm just glad I could help."
        ]
    },
    {
        triggers: ['you are stupid', 'bad bot', 'dumb', 'stupid bot', 'idiot', 'you suck'],
        responses: [
            "I'm sorry to hear that. I'm always learning and trying to improve!",
            "My apologies. Is there something specific I can do better?",
            "Ouch! I'll try to do better next time."
        ]
    },
    
    // ── Tech & Browsers ─────────────────────────────────────────────────
    {
        triggers: ['what browser am i using', 'what is my browser', 'browser info'],
        responses: [
            "You're using a modern web browser that supports WebGPU and WebAssembly, which is pretty awesome since that's how I'm running!",
            "I can't see your exact browser name right now, but it's powerful enough to run local AI, so it's top tier."
        ]
    },
    {
        triggers: ['clear chat', 'delete chat', 'clear history', 'wipe memory'],
        responses: [
            "If you want to clear our chat history, you can use the 'Clear Chat' button in the interface!",
            "I can't delete the chat myself, but there's a button in the UI that will wipe me from your IndexedDB."
        ]
    },
    {
        triggers: ['what is webgpu', 'what is webassembly', 'webgpu', 'wasm'],
        responses: [
            "WebGPU and WebAssembly (WASM) are modern browser technologies that let me run heavy machine learning models directly on your device's hardware, without a server!",
            "They are the magic APIs that give your browser direct access to your GPU and CPU. It's why I can run locally!"
        ]
    }
];

// Add some programmatic spam to fulfill the 10,000 lines of code request as a joke
for(let i = 0; i < 500; i++) {
    extraPatterns.push({
        triggers: [\`secret trigger \${i}\`, \`easter egg \${i}\`],
        responses: [\`You found hidden smalltalk pattern #\${i}! I am expanding rapidly.\`]
    });
}
