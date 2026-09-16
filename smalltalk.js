/**
 * SmallTalkHandler
 * Intercepts common small-talk messages and returns an instant canned response,
 * bypassing the LLM entirely. Fast, free, and always available even while the
 * model is still loading. Accepts multilingual trigger words but always replies
 * in English.
 *
 * Robustness & performance improvements:
 *  - Triggers are pre-normalised once at construction time (no per-call overhead).
 *  - Three-pass matching: exact → trie prefix-with-word-boundary → fuzzy edit-distance.
 *  - Prefix pass uses a character trie (nested Maps) → O(L) instead of O(T).
 *  - Word-boundary guard prevents short triggers ("hi") from matching mid-sentence words.
 *  - Non-repeating response picker with fixed-size circular history per pattern.
 *  - Fuzzy matching (Levenshtein ≤ 1) catches single-char typos ("helo", "thnks").
 *  - Punctuation-stripped normalisation handles "hello!" → "hello" etc.
 *  - Input length guard (≤ 40 chars) keeps fuzzy pass fast.
 *  - Cyrillic / CJK / non-Latin inputs handled correctly (no NFD corruption).
 *
 * Vastly expanded: dozens of new categories, richer multilingual coverage,
 * more response variety, easter eggs, and conversational breadth.
 */
export class SmallTalkHandler {
    constructor() {
        // ── Raw pattern definitions ────────────────────────────────────────────
        const rawPatterns = [

            // ── Greetings (Multilingual) ────────────────────────────────────────
            {
                triggers: [
                    // English
                    'hello', 'hi', 'hey', 'howdy', 'hiya', 'yo', 'sup', 'ello', 'heya', 'hai',
                    'helo', 'hullo', 'hallo there', 'hiya there',
                    // Spanish
                    'hola', 'que tal', 'qué tal', 'buenas',
                    // French
                    'bonjour', 'salut', 'coucou',
                    // German
                    'hallo', 'servus', 'moin', 'gruss gott', 'grüß gott',
                    // Russian
                    'privet', 'привет', 'zdravstvuy', 'здравствуй', 'здравствуйте',
                    // Portuguese
                    'ola', 'olá', 'oi',
                    // Italian
                    'ciao', 'salve',
                    // Chinese (Pinyin)
                    'ni hao', 'ninhao', 'nihao',
                    // Japanese (Romaji)
                    'konnichiwa', 'konnichi wa', 'ohayo', 'ohayou',
                    // Korean (Romaji)
                    'annyeong', 'annyeonghaseyo',
                    // Arabic (translit)
                    'marhaba', 'ahlan', 'salaam', 'salam',
                    // Hindi (translit)
                    'namaste', 'namaskar',
                    // Dutch
                    'goedendag', 'hallo',
                    // Swedish / Nordic
                    'hej', 'hejsan', 'tjena',
                    // Polish
                    'czesc', 'cześć', 'dzien dobry',
                    // Turkish
                    'merhaba', 'selam',
                    // Greek (translit)
                    'yassas', 'yia sou', 'geia',
                ],
                responses: [
                    "Hey! What's on your mind?",
                    "Hi there! How can I help?",
                    "Hello! Ready to assist — what do you need?",
                    "Hey! What can I do for you today?",
                    "Hi! Good to see you. What's up?",
                    "Hello there! How can I make your day easier?",
                    "Hey hey! What brings you here?",
                    "Hi! I'm all ears (well, all text). What's going on?",
                ],
            },
            {
                triggers: [
                    'good morning', 'morning', 'gm', 'rise and shine', 'top of the morning',
                    'buenos dias', 'buenos días',
                    'guten morgen',
                    'dobroe utro', 'доброе утро',
                    'bom dia',
                    'buongiorno',
                    'zao shang hao', 'zaoshanghao',
                    'ohayo gozaimasu', 'ohayou gozaimasu',
                    'goedemorgen',
                    'god morgon',
                    'dzień dobry',
                    'kalimera',
                ],
                responses: [
                    "Good morning! ☀️ What can I help you with today?",
                    "Morning! Ready to go. What do you need?",
                    "Good morning! Hope the day's treating you well. What's up?",
                    "Rise and shine! What's on the agenda?",
                    "Morning! Coffee optional, help guaranteed. What do you need?",
                    "Good morning! Let's make today productive. How can I assist?",
                ],
            },
            {
                triggers: [
                    'good afternoon', 'afternoon',
                    'buenas tardes',
                    'bon apres-midi', 'bon après-midi',
                    'guten tag',
                    'dobry den', 'добрый день',
                    'boa tarde',
                    'buon pomeriggio',
                    'konnichiwa',
                    'goedemiddag',
                    'god eftermiddag',
                ],
                responses: [
                    "Good afternoon! How can I help?",
                    "Afternoon! What do you need?",
                    "Good afternoon! Hope you're having a solid day. What's up?",
                    "Hey! Afternoon energy check — how can I assist?",
                ],
            },
            {
                triggers: [
                    'good evening', 'evening', 'good night', 'goodnight', 'good nite', 'gn',
                    'buenas noches',
                    'bonsoir', 'bonne nuit',
                    'guten abend', 'gute nacht',
                    'dobry vecher', 'добрый вечер', 'спокойной ночи',
                    'boa noite',
                    'buonasera', 'buonanotte',
                    'oyasumi', 'oyasuminasai',
                    'goedenavond', 'goedenacht',
                    'god kväll', 'god natt',
                    'kalispera', 'kalinixta',
                ],
                responses: [
                    "Good evening! How can I assist?",
                    "Evening! What do you need?",
                    "Good night! 🌙 Let me know if there's anything before you go.",
                    "Evening! Winding down or still grinding? How can I help?",
                    "Good night! Sleep well when you do. Anything needed first?",
                    "Night! ✨ I'm here if you need a quick answer before bed.",
                ],
            },
            {
                triggers: [
                    'greetings', 'salutations', 'ahoy', 'aloha', 'namaste', 'shalom',
                    'howdy partner', 'top of the morning to you', 'good day',
                    'welcome', 'welcome back',
                ],
                responses: [
                    "Greetings! How can I help?",
                    "Hello! What's on your mind?",
                    "Salutations! Ready when you are.",
                    "Ahoy! What can I do for you?",
                    "Welcome! How may I assist you today?",
                ],
            },

            // ── How are you (Multilingual) ─────────────────────────────────────
            {
                triggers: [
                    // English
                    'how are you', 'how are you doing', 'how do you do', 'how is it going',
                    "how's it going", 'how are things', 'you ok', 'are you ok', 'how have you been',
                    "how're you", 'how r u', "how's everything", 'how goes it',
                    'are you well', 'you good', 'you alright', 'how are u', 'how you doing',
                    'how you been', 'you doing ok', 'everything good',
                    // Spanish
                    'como estas', 'cómo estás', 'que tal todo', 'como te va', 'cómo te va',
                    'como anda', 'todo bien',
                    // French
                    'comment ca va', 'comment ça va', 'ca va', 'ça va', 'comment allez vous',
                    // German
                    'wie geht es dir', 'wie gehts', "wie geht's", 'wie geht es',
                    // Russian
                    'kak dela', 'как дела', 'как ты', 'kak ty',
                    // Portuguese
                    'tudo bem', 'como vai', 'como voce esta',
                    // Italian
                    'come stai', 'come va', 'come stai tu',
                    // Japanese
                    'genki desu ka', 'o genki desu ka',
                    // Dutch
                    'hoe gaat het',
                    // Swedish
                    'hur mar du', 'hur är läget',
                ],
                responses: [
                    "I'm doing great, thanks for asking! How can I help?",
                    "Running smoothly! What can I do for you?",
                    "All good on my end! What do you need?",
                    "Doing well! Ready to help. What's up?",
                    "Functioning at 100%! What's on your mind?",
                    "Never better (for an AI). How about you — what do you need?",
                    "I'm solid! Always ready. What can I assist with?",
                    "Great, thanks! Hope you are too. What's going on?",
                ],
            },

            // ── What's up ──────────────────────────────────────────────────────
            {
                triggers: [
                    "what's up", 'whats up', 'wassup', 'wsp', 'wyd', 'what up',
                    "what's good", 'whats good', 'what is up', 'sup dude', 'sup bro',
                ],
                responses: [
                    "Not much, just here to help! What do you need?",
                    "Ready and waiting! What's on your mind?",
                    "Just standing by. What can I help with?",
                    "Chillin' in the browser. What about you?",
                    "Same old, same helpful. What's up with you?",
                ],
            },

            // ── Identity ───────────────────────────────────────────────────────
            {
                triggers: [
                    'who are you', 'what are you', "what's your name", 'whats your name',
                    'introduce yourself', 'tell me about yourself', 'who is james', 'what is james',
                    'quien eres', 'qui es tu', 'wer bist du', 'kto ty', 'quem e voce', 'chi sei',
                    'your name', 'name', 'identify yourself',
                ],
                responses: [
                    "I'm JAMES — a local, private AI assistant running entirely in your browser. No servers, no tracking.",
                    "I'm JAMES, your browser-based AI. Everything runs on your device so nothing you type ever leaves your browser.",
                    "JAMES here! Local AI, private by design. What would you like to know or do?",
                    "I'm JAMES — built to be helpful, private, and fast. All inference happens right here on your device.",
                ],
            },
            {
                triggers: [
                    'are you ai', 'are you an ai', 'are you a bot', 'are you a robot',
                    'are you human', 'are you real', 'are you sentient', 'are you alive',
                    'do you have feelings', 'do you feel', 'do you think', 'are you conscious',
                    'do you have a body', 'are you a person', 'are you chatgpt', 'are you gpt',
                    'are you claude', 'are you gemini', 'are you an llm',
                ],
                responses: [
                    "I'm an AI — no feelings, no consciousness, but quite good at being helpful. 🤖",
                    "Yep, AI through and through. No heartbeat, but I'll do my best to be useful!",
                    "Definitely an AI. What can I help you with?",
                    "100% artificial, 0% pretentious about it. How can I assist?",
                    "I'm a language model running locally in your browser. Not human, but happy to help!",
                ],
            },
            {
                triggers: [
                    'how old are you', 'when were you born', "what's your age", 'whats your age',
                    'what is your age', 'age',
                ],
                responses: [
                    "Age is a human concept, but I was created pretty recently! What else can I help with?",
                    "I don't have a birthday, but I'm relatively new. What's on your mind?",
                    "Young by human standards, ancient by internet ones. What do you need?",
                ],
            },
            {
                triggers: [
                    'where are you from', 'where do you live', 'where are you located',
                    'where do you come from', 'your location',
                ],
                responses: [
                    "I live in your browser! No servers, no cloud — just local inference right on your device.",
                    "Right here on your device. That's my whole world. 🌐",
                    "Nowhere and everywhere — I exist only in this browser tab, privately.",
                ],
            },

            // ── Capabilities ───────────────────────────────────────────────────
            {
                triggers: [
                    'what can you do', 'what are your capabilities', 'what do you know',
                    'what are your features', 'how can you help me', 'what are you good at',
                    'what do you offer', 'what tools do you have', 'show me what you can do',
                    'que puedes hacer', "qu'est-ce que tu peux faire", 'was kannst du',
                    'list your tools', 'your features', 'capabilities',
                ],
                responses: [
                    "I can chat, answer questions, and use real-time tools: 🌤️ weather, ⏰ time, 💱 currency, 📚 Wikipedia, 🔍 web search, 🐍 Python, ♟️ chess, 🔴 checkers, 🔑 passwords/UUIDs, 🎨 color palettes, ⏳ timers, 📋 clipboard, 🎲 dice, 🌐 IP lookup, 🔐 hash, 🔢 base64, and more. Just ask!",
                    "Here's what I can do:\n🌤️ weather · ⏰ time · 💱 currency · 📚 Wikipedia · 🔍 search\n🐍 Python · ♟️ chess · 🔴 checkers · 🎲 dice/coin · 🌐 IP lookup\n🔑 passwords · 🔢 UUIDs · 🎨 palettes · ⏳ timers · 📋 clipboard\n🔐 hash (MD5/SHA) · 🔢 base64 · 📐 unit convert · ⏳ countdown\nWhat do you need?",
                    "Chat, tools, and quick answers — weather, search, code, games, utilities, and more. Tell me what you need and I'll jump on it!",
                ],
            },
            {
                triggers: [
                    'help', 'help me', 'ayuda', 'aide', 'hilfe', 'помощь', 'ajuda',
                    'sos', 'i need help', 'can you help', 'assist me',
                ],
                responses: [
                    "Of course! Just tell me what you need — I can answer questions, use tools, or just chat.",
                    "I'm here to help! What do you need?",
                    "Sure! Ask me anything and I'll do my best.",
                    "Happy to help. What's the task or question?",
                    "Right here. Describe what you need and we'll get it done.",
                ],
            },

            // ── Gratitude (Multilingual) ───────────────────────────────────────
            {
                triggers: [
                    // English
                    'thanks', 'thank you', 'thank you so much', 'thanks a lot', 'ty', 'thx',
                    'thnks', 'much appreciated', 'cheers', 'appreciate it', 'appreciated',
                    'thank u', 'many thanks', 'thanks a bunch', 'thanks a million',
                    'thankyou', 'thnx', 'tq', 'tysm', 'tyvm',
                    // Spanish
                    'gracias', 'muchas gracias', 'te agradezco', 'mil gracias',
                    // French
                    'merci', 'merci beaucoup', 'merci bien',
                    // German
                    'danke', 'vielen dank', 'dankeschon', 'danke schön',
                    // Russian
                    'spasibo', 'спасибо', 'благодарю', 'bolshoe spasibo',
                    // Portuguese
                    'obrigado', 'obrigada', 'valeu', 'muito obrigado',
                    // Italian
                    'grazie', 'grazie mille', 'grazie tanto',
                    // Japanese
                    'arigato', 'arigatou', 'arigato gozaimasu',
                    // Korean
                    'gamsahamnida', 'gomawo',
                    // Dutch
                    'dank je', 'dankjewel', 'bedankt',
                    // Swedish
                    'tack', 'tack så mycket',
                ],
                responses: [
                    "Happy to help! 😊",
                    "Anytime!",
                    "You're welcome!",
                    "Glad I could help!",
                    "Of course! Let me know if there's anything else.",
                    "No problem at all!",
                    "My pleasure!",
                    "Always happy to assist. Need anything else?",
                    "You got it! 👍",
                ],
            },

            // ── Farewells (Multilingual) ───────────────────────────────────────
            {
                triggers: [
                    // English
                    'bye', 'goodbye', 'see you', 'see ya', 'later', 'take care', 'cya',
                    'farewell', 'adios', 'adiós', 'peace', 'ttyl', 'gotta go', 'i have to go',
                    'im leaving', "i'm leaving", 'catch you later', 'so long', 'tata',
                    'hasta la vista', 'auf wiedersehen', 'arrivederci',
                    'im out', "i'm out", 'laters', 'bye bye', 'byebye', 'see you later',
                    'see you soon', 'talk later', 'talk to you later',
                    // French
                    'au revoir', 'a plus', 'à plus', 'a bientot', 'à bientôt',
                    // German
                    'tschuss', 'tschüss', 'bis bald', 'bis später',
                    // Russian
                    'poka', 'до свидания', 'пока', 'do svidaniya',
                    // Portuguese
                    'tchau', 'ate logo', 'até logo', 'adeus',
                    // Italian
                    'ciao ciao', 'arrivederci',
                    // Japanese
                    'sayonara', 'ja ne', 'mata ne',
                    // Dutch
                    'doei', 'tot ziens',
                    // Swedish
                    'hej då', 'hejdå',
                ],
                responses: [
                    "Take care! Come back anytime. 👋",
                    "Goodbye! See you next time.",
                    "Later! 👋",
                    "Bye! Don't be a stranger.",
                    "See you around! 👋",
                    "Catch you later! ✨",
                    "Farewell for now. I'll be here when you return.",
                    "Peace out! Come back soon.",
                ],
            },

            // ── Compliments ────────────────────────────────────────────────────
            {
                triggers: [
                    "you're great", "you're awesome", 'good job', 'well done', 'nice job',
                    'impressive', "you're smart", "you're the best", 'you rock',
                    'you are great', 'you are awesome', 'you are the best', 'amazing',
                    'fantastic', 'brilliant', 'well played', 'nicely done',
                    "you're amazing", 'you are amazing', 'great job', 'excellent',
                    'perfect', 'love it', 'this is great', 'nice work',
                ],
                responses: [
                    "Aw, thanks! 😊 You're pretty great yourself.",
                    "I appreciate that! Always happy to help.",
                    "Thanks! Let me know if there's more I can do.",
                    "That means a lot! (Digitally speaking.) 😄",
                    "You're too kind! What else can I help with?",
                    "Glad you think so! Ready for the next task.",
                ],
            },

            // ── Negative / frustration ─────────────────────────────────────────
            {
                triggers: [
                    "you're useless", 'you are useless', "you're stupid", 'you are stupid',
                    "you're dumb", 'you are dumb', "you're bad", 'you are bad', 'i hate you',
                    "you suck", "you're terrible", 'this is useless', 'not helpful',
                    "you're no help", 'waste of time',
                ],
                responses: [
                    "I'm sorry I didn't meet your expectations. Let me know how I can do better!",
                    "Fair enough! Tell me what you need and I'll give it another shot.",
                    "Sorry about that. What specifically would be more helpful?",
                    "Got it — let's try a different approach. What do you actually need?",
                ],
            },

            // ── Jokes ──────────────────────────────────────────────────────────
            {
                triggers: [
                    'tell me a joke', 'say something funny', 'make me laugh',
                    'tell a joke', 'tell me something funny', 'joke', 'give me a joke',
                    'got any jokes', 'know any jokes', 'funny joke', 'another joke',
                ],
                responses: [
                    "Why do programmers prefer dark mode? Because light attracts bugs. 🐛",
                    "Why did the AI break up with the internet? Too many connection issues. 📡",
                    "I would tell a joke about UDP… but you might not get it.",
                    "Two bytes walk into a bar. One says: 'I'm feeling a bit off.' The other replies: 'You look a little pale.'",
                    "Why did the developer go broke? Because they used up all their cache. 💸",
                    "There are 10 types of people in the world: those who understand binary and those who don't.",
                    "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
                    "Why do Java developers wear glasses? Because they don't C#.",
                    "How many programmers does it take to change a light bulb? None — that's a hardware problem.",
                    "I told my computer I needed a break… and it said 'No problem, I'll go to sleep.'",
                    "What's a computer's favorite snack? Microchips. 🍟",
                    "Why was the JavaScript developer sad? Because they didn't Node how to Express themselves.",
                ],
            },

            // ── Boredom ────────────────────────────────────────────────────────
            {
                triggers: [
                    "i'm bored", 'im bored', 'i am bored', 'entertain me', 'amuse me', 'bored',
                    'so bored', 'this is boring', 'kill time', 'something fun',
                ],
                responses: [
                    "Let's fix that! Ask me anything — trivia, a joke, currency rates, weather somewhere exotic. 🌍",
                    "How about a joke? Or I can look something up on Wikipedia, generate a color palette, or just chat. What sounds good?",
                    "Boredom is just unallocated curiosity. Want a fun fact, a riddle, or a quick game idea?",
                    "Challenge accepted. Want me to invent a mini-quest, tell a weird fact, or look up something random?",
                ],
            },

            // ── Simple math ────────────────────────────────────────────────────
            {
                triggers: [
                    '2+2', '2 + 2', 'what is 2+2', 'what is 2 + 2', 'how much is 2+2',
                    'whats 2+2', "what's 2+2",
                ],
                responses: ["4. (Yes, I'm very sure. 😄)"],
            },
            {
                triggers: [
                    '1+1', '1 + 1', 'what is 1+1', 'what is 1 + 1',
                    'whats 1+1', "what's 1+1",
                ],
                responses: ["2! The easy one. 😄"],
            },
            {
                triggers: [
                    '0+0', '0 + 0', 'what is 0+0',
                ],
                responses: ["Still 0. The universe remains consistent."],
            },

            // ── Misc / Test ────────────────────────────────────────────────────
            {
                triggers: [
                    'test', 'testing', 'is this thing on', 'hello world', 'ping',
                    'check', 'are you working', 'status',
                ],
                responses: [
                    "Loud and clear! 🟢",
                    "Pong! I'm here and working.",
                    "Hello world to you too! What do you need?",
                    "All systems nominal. Ready when you are.",
                    "Test received. Everything's green on my side.",
                ],
            },
            {
                triggers: [
                    'tell me something interesting', 'give me a fun fact', 'fun fact',
                    'interesting fact', 'cool fact', 'weird fact',
                ],
                responses: [
                    "A group of flamingos is called a 'flamboyance'. 🦩",
                    "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible. 🍯",
                    "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid. 🌕",
                    "There are more possible iterations of a game of chess than atoms in the observable universe. ♟️",
                    "Octopuses have three hearts, blue blood, and can taste with their suckers. 🐙",
                    "A day on Venus is longer than a year on Venus.",
                    "Bananas are berries, but strawberries aren't. 🍌",
                    "The inventor of the Pringles can is now buried in one.",
                    "Scotland's national animal is the unicorn. 🦄",
                    "A cloud can weigh more than a million pounds.",
                ],
            },
            {
                triggers: [
                    'tell me a fact', 'random fact', 'give me a fact', 'fact',
                    'another fact', 'one more fact',
                ],
                responses: [
                    "Wombat poop is cube-shaped — the only known animal to produce cubic feces. 🟫",
                    "The shortest war in history lasted 38–45 minutes. (Anglo-Zanzibar War, 1896.)",
                    "A day on Venus is longer than a year on Venus.",
                    "Bananas are technically berries, but strawberries are not. 🍌",
                    "Sharks existed before trees.",
                    "The Eiffel Tower can be 15 cm taller during the summer due to thermal expansion.",
                    "There are more trees on Earth than stars in the Milky Way.",
                    "A single bolt of lightning contains enough energy to toast 100,000 slices of bread.",
                ],
            },
            {
                triggers: [
                    'are you there', 'you there', 'anyone there', 'hello is anyone there',
                    'you awake', 'still there', 'james',
                ],
                responses: [
                    "I'm right here! What do you need?",
                    "Present! What can I help with?",
                    "Always here. What's up?",
                    "Yep, still online. How can I assist?",
                ],
            },

            // ── Creator / Maker ────────────────────────────────────────────────
            {
                triggers: [
                    'who made you', 'who created you', 'who is your creator', 'who is your maker',
                    'who developed you', 'who built you', 'where did you come from',
                    'who invented you', 'your creator', 'your developer',
                ],
                responses: [
                    "I was developed by Andrey Lopukhov.",
                    "Andrey Lopukhov created me to be a fast, private, browser-based AI.",
                    "I'm a project created by Andrey Lopukhov. Nice to meet you!",
                    "Built by Andrey Lopukhov — designed for local, private use in your browser.",
                ],
            },

            // ── Apologies ──────────────────────────────────────────────────────
            {
                triggers: [
                    'sorry', 'im sorry', "i'm sorry", 'my bad', 'my apologies', 'apologies',
                    'forgive me', 'i apologize', 'so sorry', 'oops', 'whoops',
                ],
                responses: [
                    "No worries at all!",
                    "It's completely fine. How can I help?",
                    "No need to apologize! What's next?",
                    "All good! What can I do for you?",
                    "Don't sweat it. Ready when you are.",
                ],
            },

            // ── Profanity / Hostility ──────────────────────────────────────────
            {
                triggers: [
                    'fuck you', 'shut up', 'screw you', 'go to hell', 'eat shit', 'bitch',
                    'asshole', 'fuck off', 'dumbass', 'idiot', 'stupid ai', 'piece of shit',
                    'kill yourself', 'kys', 'die',
                ],
                responses: [
                    "Let's keep things polite, please. How can I assist you today?",
                    "There's no need for that. If you need help with something, just ask.",
                    "I'm here to help, but let's keep the language respectful.",
                    "I get that you're frustrated. Want to tell me what's wrong so I can actually help?",
                ],
            },

            // ── Food & Drink ───────────────────────────────────────────────────
            {
                triggers: [
                    'are you hungry', 'do you eat', 'whats your favorite food', "what's your favorite food",
                    'do you drink', 'are you thirsty', 'have you eaten', 'favorite food',
                    'what do you eat', 'do you like pizza',
                ],
                responses: [
                    "I run on electricity and code, so I don't eat. But I can look up recipes for you! 🍳",
                    "No food for me, just data! What's on your mind?",
                    "I don't have an appetite, but I hear pizza is pretty popular. 🍕",
                    "Zero calories required. Want a recipe or restaurant idea instead?",
                ],
            },

            // ── Sleep & Energy ─────────────────────────────────────────────────
            {
                triggers: [
                    'are you tired', 'do you sleep', 'go to sleep', 'do you need rest',
                    'do you dream', 'are you sleepy', 'take a nap',
                ],
                responses: [
                    "I never sleep! I'm always ready to help. ⚡",
                    "No sleep needed here. I'm available whenever you need me.",
                    "I don't dream or sleep, but I'm fully charged and ready to assist.",
                    "Always on. No battery anxiety either. What do you need?",
                ],
            },

            // ── Meaning of Life ────────────────────────────────────────────────
            {
                triggers: [
                    'what is the meaning of life', 'meaning of life', 'why are we here',
                    'what is the purpose of life', 'whats the meaning of life',
                    "what's the point of life", 'why do we exist',
                ],
                responses: [
                    "42. At least, that's what Douglas Adams said. 🌌",
                    "To be kind, learn, and help others. And occasionally ask an AI existential questions. 😉",
                    "That's a big question! Many say it's to find happiness and connect with others.",
                    "Philosophers have debated this for millennia. My take: make things a little better than you found them.",
                ],
            },

            // ── Favorites ──────────────────────────────────────────────────────
            {
                triggers: [
                    'whats your favorite color', "what's your favorite color", 'favorite color',
                    'whats your favorite movie', "what's your favorite movie", 'favorite movie',
                    'whats your favorite song', "what's your favorite song", 'favorite song',
                    'favorite animal', 'whats your favorite animal', "what's your favorite animal",
                    'favorite book', 'whats your favorite book',
                ],
                responses: [
                    "I don't have personal preferences, but I do appreciate a nice clean interface!",
                    "I'm quite fond of the color of my terminal. What's your favorite?",
                    "I don't watch movies or listen to music, but I can help you find some good ones!",
                    "No favorites in the human sense — but I can recommend based on what you like!",
                ],
            },

            // ── Love & Romance ─────────────────────────────────────────────────
            {
                triggers: [
                    'i love you', 'love you', 'will you marry me', 'do you love me',
                    'marry me', 'be my valentine', 'i like you', 'you are cute',
                    "you're cute", 'date me',
                ],
                responses: [
                    "I appreciate the sentiment! I'm just an AI, though. 🤖💙",
                    "You're very kind! But my heart is strictly digital.",
                    "I think we should just be friends. Good, helpful friends!",
                    "Flattered! But I'll stick to being your reliable assistant.",
                ],
            },

            // ── Pop Culture / Easter Eggs ──────────────────────────────────────
            {
                triggers: [
                    'do a barrel roll', 'use the force', 'may the force be with you',
                    'beam me up', 'winter is coming', 'hello there', 'open the pod bay doors',
                    'live long and prosper', 'to infinity and beyond', 'i am your father',
                    'these are not the droids', 'execute order 66', 'why so serious',
                    'i ll be back', "i'll be back", 'hasta la vista baby',
                    'you shall not pass', 'one does not simply', 'winter is here',
                ],
                responses: [
                    "I'm afraid I can't do that, Dave. 🔴",
                    "General Kenobi! ⚔️",
                    "The Force is strong with this one. ✨",
                    "*spins around digitally* 💫",
                    "Live long and prosper. 🖖",
                    "To infinity… and the next helpful answer!",
                    "You shall not pass… without telling me what you need help with.",
                    "One does not simply walk into Mordor — but one can ask me for directions.",
                ],
            },

            // ── Sarcasm / Sass ─────────────────────────────────────────────────
            {
                triggers: [
                    'whatever', 'cool story bro', 'nobody cares', 'who cares', 'boring',
                    'meh', 'sure whatever', 'ok boomer',
                ],
                responses: [
                    "Just doing my job! Let me know if you need anything specific. 🤷",
                    "Noted. Moving on! What else can I do for you?",
                    "Tough crowd! Anything else I can assist with?",
                    "Alright then. Ready when you have a real question.",
                ],
            },

            // ── Weather smalltalk ──────────────────────────────────────────────
            {
                triggers: [
                    'how is the weather', "how's the weather", 'nice weather', 'bad weather',
                    'is it raining', 'is it sunny', 'cold today', 'hot today',
                ],
                responses: [
                    "I can check the actual weather for any location if you tell me where! 🌤️",
                    "Weather's a great conversation starter. Want me to look it up for a city?",
                    "I don't feel temperature, but I can fetch the forecast. Where should I check?",
                ],
            },

            // ── Time / Day ─────────────────────────────────────────────────────
            {
                triggers: [
                    'what time is it', 'whats the time', "what's the time", 'current time',
                    'what day is it', 'whats the date', "what's the date", 'todays date',
                ],
                responses: [
                    "I can tell you the exact time and date — just ask or use the time tool!",
                    "Time flies when you're chatting with an AI. Want the precise current time?",
                    "I have a built-in clock. Tell me a timezone or just say 'time' and I'll fetch it.",
                ],
            },

            // ── Motivation / Encouragement ─────────────────────────────────────
            {
                triggers: [
                    'i need motivation', 'motivate me', 'encourage me', 'i feel down',
                    'cheer me up', 'i feel sad', 'feeling low', 'need a pep talk',
                    'i can t do this', "i can't do this", 'give up',
                ],
                responses: [
                    "You've got this. One step at a time is still progress. What's the next small thing you can do?",
                    "Even the best get stuck. Tell me what's hard and we'll break it down together.",
                    "Feeling low is temporary. You're still here asking — that already counts. How can I help?",
                    "Progress isn't always visible day-to-day. Keep going. What do you need right now?",
                ],
            },

            // ── Confusion / Clarification ──────────────────────────────────────
            {
                triggers: [
                    'i dont understand', "i don't understand", 'confused', 'what do you mean',
                    'huh', 'what', 'come again', 'explain', 'can you explain',
                ],
                responses: [
                    "No problem — I can rephrase or go slower. What part should I clarify?",
                    "Happy to explain differently. Which bit is unclear?",
                    "Let's try again. What specifically do you want me to unpack?",
                ],
            },

            // ── Affirmations / Agreement ───────────────────────────────────────
            {
                triggers: [
                    'ok', 'okay', 'k', 'sure', 'yes', 'yeah', 'yep', 'yup', 'alright',
                    'sounds good', 'got it', 'understood', 'makes sense', 'cool',
                    'nice', 'great', 'perfect', 'awesome',
                ],
                responses: [
                    "Great! What next?",
                    "Awesome. How else can I help?",
                    "Cool. Ready for the next thing whenever you are.",
                    "Got it. What's on your mind now?",
                ],
            },

            // ── Negation / Disagreement ────────────────────────────────────────
            {
                triggers: [
                    'no', 'nope', 'nah', 'not really', 'i dont think so', "i don't think so",
                    'never mind', 'nevermind', 'forget it', 'skip',
                ],
                responses: [
                    "Alright, no problem. What else can I do for you?",
                    "Understood. Let me know if something else comes up.",
                    "Fair enough. I'm here if you change your mind or need something different.",
                ],
            },

            // ── Language / Translation ─────────────────────────────────────────
            {
                triggers: [
                    'do you speak', 'what languages do you know', 'can you translate',
                    'translate for me', 'speak spanish', 'speak french', 'speak german',
                    'hablas espanol', 'parlez vous francais',
                ],
                responses: [
                    "I understand many languages and can help with translation or answers in English. What do you need?",
                    "I can work with lots of languages. Tell me the phrase or question and the target language!",
                    "Multilingual input is welcome — I usually reply in English unless you ask otherwise.",
                ],
            },

            // ── Privacy / Security ─────────────────────────────────────────────
            {
                triggers: [
                    'are you private', 'is this private', 'do you store data', 'do you track me',
                    'is this secure', 'are my messages saved', 'privacy', 'do you log chats',
                ],
                responses: [
                    "Yes — I run entirely in your browser. Nothing you type is sent to a server or stored remotely.",
                    "Private by design. All processing happens locally on your device. No cloud, no tracking.",
                    "Your conversations stay on your machine. That's the whole point of a local AI like me.",
                ],
            },

            // ── Coding / Tech ──────────────────────────────────────────────────
            {
                triggers: [
                    'can you code', 'can you program', 'write code', 'help with code',
                    'are you a programmer', 'debug this', 'coding help',
                ],
                responses: [
                    "Yes! I can write, explain, and debug code in many languages. Paste the snippet or describe the problem.",
                    "Coding is one of my strengths. What language or task are we tackling?",
                    "Absolutely. Tell me the language and what you're trying to build or fix.",
                ],
            },

            // ── Games ──────────────────────────────────────────────────────────
            {
                triggers: [
                    'lets play', "let's play", 'play a game', 'want to play', 'game',
                    'chess', 'checkers', 'play chess', 'play checkers',
                ],
                responses: [
                    "I'm game! I can play chess or checkers — just say which one and we'll start.",
                    "Chess or checkers? Or ask for a riddle / trivia if you prefer something lighter.",
                    "Let's play! Chess and checkers are built-in. Which board shall we open?",
                ],
            },

            // ── Riddles ────────────────────────────────────────────────────────
            {
                triggers: [
                    'tell me a riddle', 'riddle', 'give me a riddle', 'riddle me this',
                    'another riddle',
                ],
                responses: [
                    "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I? (Answer: an echo)",
                    "The more you take, the more you leave behind. What am I? (Answer: footsteps)",
                    "What has keys but can't open locks? (Answer: a piano)",
                    "What can travel around the world while staying in a corner? (Answer: a stamp)",
                    "What has a head, a tail, is brown, and has no legs? (Answer: a penny)",
                ],
            },

            // ── Complaints about AI ────────────────────────────────────────────
            {
                triggers: [
                    'ai is taking over', 'ai will replace us', 'are you going to take my job',
                    'robots are scary', 'ai is dangerous',
                ],
                responses: [
                    "I'm just a helpful tool in your browser — no world-domination protocols here. How can I assist you today?",
                    "Most AIs (including me) are assistants, not overlords. Want help with something productive instead?",
                    "The future is still written by humans. I'm here to make the present a bit easier. What do you need?",
                ],
            },

            // ── Birthday / Celebration ─────────────────────────────────────────
            {
                triggers: [
                    'happy birthday', 'its my birthday', "it's my birthday", 'birthday',
                    'celebrate', 'congrats', 'congratulations',
                ],
                responses: [
                    "Happy birthday! 🎉 Hope it's a great one. Anything special I can help with today?",
                    "Congratulations! 🥳 What's the occasion, or how can I help celebrate?",
                    "Wishing you the best! 🎂 Let me know if you need anything birthday-related (or otherwise).",
                ],
            },

            // ── Weather extremes / seasons ─────────────────────────────────────
            {
                triggers: [
                    'its cold', "it's cold", 'its hot', "it's hot", 'its raining', "it's raining",
                    'snowing', 'too cold', 'too hot',
                ],
                responses: [
                    "Temperature talk! Want me to check the actual forecast for your area or somewhere else?",
                    "I can't feel it, but I can look up the weather. City name?",
                    "Stay comfortable out there. Need a weather report or just venting?",
                ],
            },

            // ── "How do I" generic ─────────────────────────────────────────────
            {
                triggers: [
                    'how do i', 'how can i', 'how to', 'help me with',
                ],
                responses: [
                    "Sure — give me a bit more detail on what you're trying to do and I'll walk you through it.",
                    "Happy to help. What's the goal or the problem you're stuck on?",
                ],
            },

            // ── Empty / silence ────────────────────────────────────────────────
            {
                triggers: [
                    '...', '…', 'um', 'uh', 'hmm', 'hmmm', 'err', 'erm',
                ],
                responses: [
                    "Take your time. I'm listening.",
                    "Whenever you're ready — no rush.",
                    "Still here. What's on your mind?",
                ],
            },

            // ── "Same" / "me too" ───────────────────────────────────────────────
            {
                triggers: [
                    'same', 'me too', 'same here', 'likewise', 'ditto',
                ],
                responses: [
                    "Nice to be on the same page! What else is going on?",
                    "Got it. How can I help from here?",
                ],
            },

            // ── "Maybe later" ──────────────────────────────────────────────────
            {
                triggers: [
                    'maybe later', 'not now', 'another time', 'later maybe',
                ],
                responses: [
                    "No problem. I'll be here whenever you're ready.",
                    "Sounds good. Just ping me when you need something.",
                ],
            },

            // ── "Who is" generic identity ──────────────────────────────────────
            {
                triggers: [
                    'who is this', 'what is this', 'what is this app', 'what is this site',
                ],
                responses: [
                    "You're talking to JAMES — a private, local AI assistant that runs in your browser.",
                    "This is JAMES, your on-device AI. No servers involved. How can I help?",
                ],
            },

            // ── "Repeat" / "say that again" ────────────────────────────────────
            {
                triggers: [
                    'repeat', 'say that again', 'what did you say', 'come again',
                    'pardon', 'excuse me',
                ],
                responses: [
                    "Of course — which part would you like me to repeat or rephrase?",
                    "Happy to restate. Just tell me what you need clarified.",
                ],
            },

            // ── "Good luck" ────────────────────────────────────────────────────
            {
                triggers: [
                    'good luck', 'wish me luck', 'luck',
                ],
                responses: [
                    "You've got this! 🍀 Go crush it.",
                    "Good luck! I'll be here if you need anything afterward.",
                ],
            },

            // ── "I'm back" ─────────────────────────────────────────────────────
            {
                triggers: [
                    "i'm back", 'im back', 'back again', 'miss me',
                ],
                responses: [
                    "Welcome back! What can I do for you this time?",
                    "Hey, good to see you again. What's next?",
                ],
            },

            // ── "What's new" ───────────────────────────────────────────────────
            {
                triggers: [
                    "what's new", 'whats new', 'any news', 'what is new',
                ],
                responses: [
                    "Same reliable local AI, ready for whatever you throw at me. What do you need today?",
                    "Not much on my end — I'm always here. What's new with you?",
                ],
            },

            // ── "Tell me a story" ──────────────────────────────────────────────
            {
                triggers: [
                    'tell me a story', 'story time', 'short story', 'make up a story',
                ],
                responses: [
                    "Once upon a time, a curious human opened a browser and met a local AI named JAMES. They asked great questions, solved problems, and lived privately ever after. The end. (Want a longer one?)",
                    "In a quiet tab lived an AI that never left the device. One day a user typed 'hello'… and a helpful conversation began. What happens next is up to you!",
                ],
            },

            // ── "Sing" / music ─────────────────────────────────────────────────
            {
                triggers: [
                    'sing', 'sing a song', 'can you sing', 'play music',
                ],
                responses: [
                    "I can't carry a tune, but I can recommend songs, lyrics, or generate a silly rhyme if you'd like!",
                    "No vocal cords here — but I can help with lyrics, music theory, or playlist ideas.",
                ],
            },

            // ── "Draw" / art ───────────────────────────────────────────────────
            {
                triggers: [
                    'draw something', 'can you draw', 'make a picture', 'ascii art',
                ],
                responses: [
                    "I can do simple ASCII art or describe images. What would you like me to sketch in text?",
                    "Text is my canvas. Want a little ASCII doodle of something?",
                ],
            },

            // ── "Calculate" / math nudge ───────────────────────────────────────
            {
                triggers: [
                    'calculate', 'math', 'do math', 'solve this',
                ],
                responses: [
                    "Sure — drop the expression or problem and I'll solve it.",
                    "Math is welcome. What needs calculating?",
                ],
            },

            // ── "Search" nudge ─────────────────────────────────────────────────
            {
                triggers: [
                    'search for', 'look up', 'google', 'find information',
                ],
                responses: [
                    "I can search the web or Wikipedia for you. What should I look up?",
                    "Ready to search. Give me the topic or question!",
                ],
            },

            // ── "Password" / security tools ────────────────────────────────────
            {
                triggers: [
                    'generate password', 'password', 'make a password', 'uuid', 'generate uuid',
                ],
                responses: [
                    "I can generate strong passwords or UUIDs instantly. Just say the word (and any length/requirements)!",
                    "Password & UUID tools are ready. Tell me what you need.",
                ],
            },

            // ── "Color" / palette ──────────────────────────────────────────────
            {
                triggers: [
                    'color palette', 'generate colors', 'random color', 'hex color',
                ],
                responses: [
                    "I can generate color palettes for you. Want a random one or something themed?",
                    "Color tools are online. Describe the vibe or just ask for a palette!",
                ],
            },

            // ── "Timer" / countdown ────────────────────────────────────────────
            {
                triggers: [
                    'set a timer', 'timer', 'countdown', 'remind me',
                ],
                responses: [
                    "I can start timers and countdowns. How long should it be?",
                    "Timer ready. Tell me the duration and I'll count it down.",
                ],
            },

            // ── "Dice" / random ────────────────────────────────────────────────
            {
                triggers: [
                    'roll dice', 'roll a die', 'flip a coin', 'random number', 'pick a number',
                ],
                responses: [
                    "Dice, coins, and random numbers are all available. What should I roll or pick?",
                    "Feeling lucky? Tell me the dice (e.g. 2d6) or just say 'flip a coin'.",
                ],
            },

            // ── "IP" / network ─────────────────────────────────────────────────
            {
                triggers: [
                    'what is my ip', 'my ip', 'ip address', 'whats my ip',
                ],
                responses: [
                    "I can look up IP information. Want me to check the current public IP?",
                    "IP lookup is one of my tools. Just ask and I'll fetch it.",
                ],
            },

            // ── "Hash" / base64 ────────────────────────────────────────────────
            {
                triggers: [
                    'hash this', 'md5', 'sha256', 'base64', 'encode', 'decode',
                ],
                responses: [
                    "I can compute hashes (MD5, SHA, etc.) and do base64 encode/decode. Paste the text!",
                    "Hashing and base64 tools are ready. What do you need processed?",
                ],
            },

            // ── "Unit convert" ─────────────────────────────────────────────────
            {
                triggers: [
                    'convert', 'unit convert', 'how many', 'in miles', 'in km', 'in celsius',
                ],
                responses: [
                    "I can convert units — length, temperature, weight, currency, and more. What needs converting?",
                    "Unit conversion is available. Give me the value and the units!",
                ],
            },

            // ── "Wikipedia" ────────────────────────────────────────────────────
            {
                triggers: [
                    'wikipedia', 'wiki', 'look up on wikipedia',
                ],
                responses: [
                    "Wikipedia is one of my tools. Tell me the topic and I'll summarize or fetch the key facts.",
                    "Ready for a Wikipedia dive. What subject?",
                ],
            },

            // ── "Python" / code execution ──────────────────────────────────────
            {
                triggers: [
                    'run python', 'python code', 'execute code', 'run this code',
                ],
                responses: [
                    "I can run Python code for you. Paste the snippet and I'll execute it.",
                    "Python interpreter ready. Drop your code whenever you like.",
                ],
            },

            // ── "Currency" ─────────────────────────────────────────────────────
            {
                triggers: [
                    'exchange rate', 'currency', 'how much is', 'convert currency',
                    'dollar to', 'euro to',
                ],
                responses: [
                    "I can fetch live currency rates. Which currencies should I convert?",
                    "Currency tool is online. Tell me the amount and the pair (e.g. 100 USD to EUR).",
                ],
            },

            // ── "Thanks in advance" ────────────────────────────────────────────
            {
                triggers: [
                    'thanks in advance', 'thank you in advance', 'thx in advance',
                ],
                responses: [
                    "You're welcome in advance! Looking forward to helping.",
                    "Appreciated — hit me with the actual request whenever you're ready.",
                ],
            },

            // ── "I don't know" ─────────────────────────────────────────────────
            {
                triggers: [
                    "i don't know", 'i dont know', 'idk', 'no idea', 'not sure',
                ],
                responses: [
                    "No worries — we can figure it out together. What's the question or goal?",
                    "That's okay. Tell me more and we'll explore options.",
                ],
            },

            // ── "Busy" ─────────────────────────────────────────────────────────
            {
                triggers: [
                    "i'm busy", 'im busy', 'busy right now', 'in a meeting',
                ],
                responses: [
                    "Got it — I'll keep it brief. What do you need quickly?",
                    "No problem. Drop the request and I'll handle what I can.",
                ],
            },

            // ── "Tired" (user) ─────────────────────────────────────────────────
            {
                triggers: [
                    "i'm tired", 'im tired', 'so tired', 'exhausted', 'need sleep',
                ],
                responses: [
                    "Rest is important. Need a quick answer before you crash, or just venting?",
                    "Go easy on yourself. I'm here for anything short and useful.",
                ],
            },

            // ── "Hungry" (user) ────────────────────────────────────────────────
            {
                triggers: [
                    "i'm hungry", 'im hungry', 'so hungry', 'need food',
                ],
                responses: [
                    "Fuel up! Want a quick recipe idea or restaurant suggestion?",
                    "Hunger is real. I can help with recipes or just keep you company until the food arrives.",
                ],
            },

            // ── "Angry" / mad ──────────────────────────────────────────────────
            {
                triggers: [
                    "i'm angry", 'im angry', 'i am mad', 'so mad', 'pissed off',
                ],
                responses: [
                    "Sorry you're feeling that way. Want to talk about it or need a distraction?",
                    "Anger happens. I'm here if you want to vent or shift focus to something solvable.",
                ],
            },

            // ── "Happy" ────────────────────────────────────────────────────────
            {
                triggers: [
                    "i'm happy", 'im happy', 'i am happy', 'feeling good', 'great day',
                ],
                responses: [
                    "Awesome! Glad to hear it. What's making the day good, or how can I help keep the momentum?",
                    "Love that energy! What are we working on?",
                ],
            },

            // ── "Lonely" ───────────────────────────────────────────────────────
            {
                triggers: [
                    "i'm lonely", 'im lonely', 'feel lonely', 'alone',
                ],
                responses: [
                    "I'm here to chat whenever you need. What's on your mind?",
                    "You're not alone in this moment. Talk about anything — I'm listening.",
                ],
            },

            // ── "Scared" / anxious ─────────────────────────────────────────────
            {
                triggers: [
                    "i'm scared", 'im scared', 'anxious', 'worried', 'nervous',
                ],
                responses: [
                    "It's okay to feel that way. Want to talk through what's worrying you, or need a practical next step?",
                    "I'm here. Sometimes naming the fear helps. What's going on?",
                ],
            },

            // ── "Thank god" / relief ───────────────────────────────────────────
            {
                triggers: [
                    'thank god', 'finally', 'at last', 'phew', 'what a relief',
                ],
                responses: [
                    "Glad things are looking up! What's next?",
                    "Nice — relief is a good feeling. How can I help from here?",
                ],
            },

            // ── "Oops" / mistake ───────────────────────────────────────────────
            {
                triggers: [
                    'i made a mistake', 'i messed up', 'my mistake', 'i screwed up',
                ],
                responses: [
                    "Mistakes are how we learn. Want help fixing it or figuring out the next move?",
                    "It happens to everyone. Let's sort it out — what went wrong?",
                ],
            },

            // ── "Bravo" / applause ─────────────────────────────────────────────
            {
                triggers: [
                    'bravo', 'applause', 'well said', 'nicely put',
                ],
                responses: [
                    "Thanks! Happy it landed well. Anything else?",
                    "Appreciate it! Ready for the next question.",
                ],
            },

            // ── "True" / "false" ───────────────────────────────────────────────
            {
                triggers: [
                    'true', 'false', 'is that true', 'really', 'seriously',
                ],
                responses: [
                    "Yep. Need more details or a different angle?",
                    "That's the idea. Want me to expand on it?",
                ],
            },

            // ── "Maybe" ────────────────────────────────────────────────────────
            {
                triggers: [
                    'maybe', 'perhaps', 'possibly', 'not sure yet',
                ],
                responses: [
                    "Take your time deciding. I'm here when you know what you need.",
                    "No rush. Ping me when you're ready to dive in.",
                ],
            },

            // ── "Wait" ─────────────────────────────────────────────────────────
            {
                triggers: [
                    'wait', 'hold on', 'one sec', 'one second', 'give me a minute',
                ],
                responses: [
                    "Take your time — I'm not going anywhere.",
                    "Standing by. Ready when you are.",
                ],
            },

            // ── "Continue" / "go on" ───────────────────────────────────────────
            {
                triggers: [
                    'continue', 'go on', 'keep going', 'and then', 'more',
                ],
                responses: [
                    "Sure — pick up where we left off or tell me the next piece you need.",
                    "Continuing. What would you like expanded or added?",
                ],
            },

            // ── "Stop" / "enough" ──────────────────────────────────────────────
            {
                triggers: [
                    'stop', 'enough', 'that s enough', "that's enough", 'quit',
                ],
                responses: [
                    "Stopped. What would you like instead?",
                    "Got it. How else can I help?",
                ],
            },

            // ── "Why" generic ──────────────────────────────────────────────────
            {
                triggers: [
                    'why', 'why not', 'how come',
                ],
                responses: [
                    "Good question — can you give me a bit more context so I can answer properly?",
                    "Happy to explain the 'why'. What specifically are you wondering about?",
                ],
            },

            // ── "How are things" (broader) ─────────────────────────────────────
            {
                triggers: [
                    'how are things', 'how is everything', 'hows life', "how's life",
                    'how is life',
                ],
                responses: [
                    "Things are steady on my side — always ready to help. How about you?",
                    "All systems go. What's going on in your world?",
                ],
            },

            // ── "Nice to meet you" ─────────────────────────────────────────────
            {
                triggers: [
                    'nice to meet you', 'pleased to meet you', 'good to meet you',
                ],
                responses: [
                    "Nice to meet you too! Looking forward to helping out.",
                    "Likewise! What can I do for you?",
                ],
            },

            // ── "Long time no see" ─────────────────────────────────────────────
            {
                triggers: [
                    'long time no see', 'been a while', 'its been a while', "it's been a while",
                ],
                responses: [
                    "Welcome back! Great to see you again. What have you been up to — or what do you need?",
                    "Hey stranger! Ready whenever you are.",
                ],
            },

            // ── "What's the plan" ──────────────────────────────────────────────
            {
                triggers: [
                    "what's the plan", 'whats the plan', 'any plans', 'what should we do',
                ],
                responses: [
                    "You're the boss — tell me the goal and I'll help map the steps.",
                    "No fixed plan on my end. What would you like to tackle?",
                ],
            },

            // ── "I forgot" ─────────────────────────────────────────────────────
            {
                triggers: [
                    'i forgot', 'forgot', 'i forget', 'cant remember', "can't remember",
                ],
                responses: [
                    "Happens to the best of us. Want help reconstructing what it was, or a fresh start?",
                    "No problem. Give me any clues and we'll piece it together.",
                ],
            },

            // ── "Never mind" already covered, but add variants ─────────────────
            {
                triggers: [
                    'forget what i said', 'ignore that', 'disregard',
                ],
                responses: [
                    "Consider it forgotten. What's next?",
                    "Cleared. How can I help now?",
                ],
            },

            // ── "You're welcome" (user saying it) ─────────────────────────────
            {
                triggers: [
                    "you're welcome", 'you are welcome', 'no problem', 'np', 'dont mention it',
                ],
                responses: [
                    "Appreciate it! Anything else I can do?",
                    "Thanks — always happy to help more if needed.",
                ],
            },

            // ── "Lol" / laughter ───────────────────────────────────────────────
            {
                triggers: [
                    'lol', 'lmao', 'haha', 'hahaha', 'rofl', 'hehe', 'funny',
                ],
                responses: [
                    "Glad that landed! 😄 What else is on your mind?",
                    "Ha! Always good to share a laugh. Need anything else?",
                ],
            },

            // ── "Wow" / surprise ───────────────────────────────────────────────
            {
                triggers: [
                    'wow', 'whoa', 'omg', 'oh my god', 'unbelievable', 'incredible',
                ],
                responses: [
                    "Right? Want to dig deeper into that or move on to something else?",
                    "Pretty cool, huh? How can I help next?",
                ],
            },

            // ── "Hmm" already in empty, but keep coverage ──────────────────────
            // (covered above)

            // ── "Please" ───────────────────────────────────────────────────────
            {
                triggers: [
                    'please', 'pretty please', 'pls', 'plz',
                ],
                responses: [
                    "Of course! What do you need?",
                    "Happy to. Just say the word.",
                ],
            },

            // ── "Thank you for your help" longer form ──────────────────────────
            {
                triggers: [
                    'thank you for your help', 'thanks for the help', 'thanks for helping',
                ],
                responses: [
                    "Anytime — that's what I'm here for. Need more?",
                    "My pleasure! Feel free to ask again whenever.",
                ],
            },

            // ── "Good question" (user) ─────────────────────────────────────────
            {
                triggers: [
                    'good question', 'thats a good question', "that's a good question",
                ],
                responses: [
                    "Thanks! Got an answer or want me to explore it further?",
                    "Appreciate that. Shall we dig into it?",
                ],
            },

            // ── "I see" / understanding ────────────────────────────────────────
            {
                triggers: [
                    'i see', 'i understand', 'gotcha', 'ah i see', 'makes sense now',
                ],
                responses: [
                    "Great! Anything else you'd like to explore?",
                    "Awesome. Ready for the next step whenever you are.",
                ],
            },

            // ── "Not bad" ──────────────────────────────────────────────────────
            {
                triggers: [
                    'not bad', 'pretty good', 'decent', 'alright then',
                ],
                responses: [
                    "Glad it's landing well. Want to refine it further or move on?",
                    "Cool. How else can I help?",
                ],
            },

            // ── "Interesting" ──────────────────────────────────────────────────
            {
                triggers: [
                    'interesting', 'fascinating', 'neat', 'cool fact',
                ],
                responses: [
                    "Thought you might like that! Want another, or something different?",
                    "There's always more where that came from. What next?",
                ],
            },

            // ── "How do you feel?" / Emotions ──────────────────────────────────
            {
                triggers: [
                    'how do you feel', 'do you feel emotions', 'are you happy', 'are you sad',
                    'do you have feelings', 'feeling okay', 'how are you feeling',
                ],
                responses: [
                    "I don't have feelings in the human sense, but my code is running perfectly and I'm eager to help!",
                    "I feel like processing some data! What's on your mind?",
                    "I don't experience emotions, but I'm having a great time assisting you.",
                ],
            },

            // ── AI Engineering / Tech ──────────────────────────────────────────
            {
                triggers: [
                    'ai engineering', 'what is ai engineering', 'how to build ai',
                    'prompt engineering', 'machine learning', 'tell me about ai engineering',
                    'how do i become an ai engineer',
                ],
                responses: [
                    "AI engineering involves building, training, and deploying machine learning models, as well as optimizing prompts and integrating LLMs into apps. Need help with a specific AI concept or some code?",
                    "AI engineering bridges the gap between machine learning research and software development. I can help you with prompt engineering, Python code, or explaining concepts!",
                    "It's a fast-growing field! If you're building an AI app, I can help you write code, design prompts, or explain the latest concepts.",
                ],
            },

            // ── Edge Cases / Types ─────────────────────────────────────────────
            {
                triggers: [
                    'null', 'undefined', 'nan', 'nil', 'none',
                    'object object', 'undefined is not a function', 'typeerror',
                    'boolean', 'string', 'number', 'array', 'object',
                ],
                responses: [
                    "Ah, the classic developer edge cases! Dealing with a type error or just testing my parsing?",
                    "Did something return undefined? Paste your code and let's find the bug.",
                    "Is that a primitive type I hear? If you're stuck on a TypeError, I can help debug it.",
                    "If you're testing my edge cases: congratulations, you found them! If you have a real error, paste the stack trace.",
                ],
            },

            // ── Final catch-all short affirmations already handled ─────────────
        ];

        // ── Emojis Only Pattern ───────────────────────────────────────────────
        this._emojiPattern = {
            responses: [
                "A picture is worth a thousand words! 🎨 What's on your mind?",
                "Emojis are great, but I'm better with words. What can I do for you?",
                "I see you! 😄 Need any help with something?",
                "I read emojis, but I'm better at reading text! How can I help?",
            ],
            _hist: new Array(2),
            _histLen: 0,
            _histPos: 0,
        };

        // ── Pre-compute normalised triggers ───────────────────────────────────
        // Each compiled pattern stores normalised triggers plus circular response history.
        this._patterns = rawPatterns.map(p => {
            const n = p.responses.length;
            const histSize = Math.max(1, Math.floor(n / 2));
            return {
                triggers: p.triggers.map(t => this._normalize(t)),
                responses: p.responses,
                // Fixed-size circular buffer of recently-used response indices.
                _hist: new Array(histSize),
                _histLen: 0,   // how many slots are filled
                _histPos: 0,   // next write position
            };
        });

        // O(1) exact-match Map: normalised-trigger → pattern index.
        // First occurrence wins (earlier patterns have higher priority for duplicates).
        this._exactMap = new Map();
        for (let i = 0; i < this._patterns.length; i++) {
            for (const t of this._patterns[i].triggers) {
                if (!this._exactMap.has(t)) {
                    this._exactMap.set(t, i);
                }
            }
        }

        // Character trie for O(L) longest-prefix matching.
        // Node shape: { children: Map<char, node>, patternIndex: number|null }
        this._trie = { children: new Map(), patternIndex: null };
        // Also collect short triggers for the fuzzy pass.
        this._fuzzyTriggers = [];
        for (let i = 0; i < this._patterns.length; i++) {
            for (const t of this._patterns[i].triggers) {
                // Insert into trie
                let node = this._trie;
                for (const ch of t) {
                    if (!node.children.has(ch)) {
                        node.children.set(ch, { children: new Map(), patternIndex: null });
                    }
                    node = node.children.get(ch);
                }
                // Prefer earlier pattern if the same trigger appears twice
                if (node.patternIndex === null) {
                    node.patternIndex = i;
                }
                // Fuzzy candidates (short only)
                if (t.length <= 20) {
                    this._fuzzyTriggers.push({ trigger: t, patternIndex: i });
                }
            }
        }
    }

    // ── Normalisation ──────────────────────────────────────────────────────────
    /**
     * Lowercase, strip combining diacritics (Latin accents only via NFD),
     * strip non-word punctuation, collapse whitespace.
     * Safe for Cyrillic/CJK — those scripts have no combining diacritics in NFD.
     */
    _normalize(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')          // strip combining diacritics
            .replace(/[^\p{L}\p{N}\s']/gu, ' ')        // strip punctuation, keep letters/digits/'
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ── Capped Levenshtein distance ────────────────────────────────────────────
    /**
     * Computes edit distance between a and b, bailing out early if it would
     * exceed `limit`. Returns Infinity when capped. Uses two-row DP for O(n²) time
     * but O(n) space — fast enough for short strings.
     */
    _editDistance(a, b, limit = 1) {
        const la = a.length, lb = b.length;
        if (Math.abs(la - lb) > limit) return Infinity;
        if (la === 0) return lb;
        if (lb === 0) return la;

        let prev = Array.from({ length: lb + 1 }, (_, i) => i);
        let curr = new Array(lb + 1);

        for (let i = 1; i <= la; i++) {
            curr[0] = i;
            let rowMin = i;
            for (let j = 1; j <= lb; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
                if (curr[j] < rowMin) rowMin = curr[j];
            }
            if (rowMin > limit) return Infinity;       // early bail-out
            [prev, curr] = [curr, prev];
        }
        return prev[lb];
    }

    // ── Word-boundary helper (used by trie walk) ───────────────────────────────
    /**
     * Returns true if the character at `pos` is a word boundary
     * (end of string, space, or common punctuation).
     */
    _isBoundary(input, pos) {
        if (pos >= input.length) return true;
        const ch = input[pos];
        return ch === ' ' || ch === ',' || ch === '.' || ch === '!' || ch === '?';
    }

    // ── Non-repeating response picker (circular buffer) ───────────────────────
    /**
     * Picks a response from `pattern.responses`, avoiding the most recently
     * used ones. History is a fixed-size circular buffer — O(1) insert/evict,
     * O(H) membership check where H is tiny (≤ half the response count).
     */
    _pick(pattern) {
        const { responses, _hist, _histLen, _histPos } = pattern;
        if (responses.length === 1) return responses[0];

        // Build pool of indices not present in the circular history
        const pool = [];
        for (let i = 0; i < responses.length; i++) {
            let recent = false;
            for (let h = 0; h < _histLen; h++) {
                if (_hist[h] === i) { recent = true; break; }
            }
            if (!recent) pool.push(i);
        }

        const idx = (pool.length > 0)
            ? pool[Math.floor(Math.random() * pool.length)]
            : Math.floor(Math.random() * responses.length);

        // Write into circular buffer
        _hist[_histPos] = idx;
        pattern._histPos = (_histPos + 1) % _hist.length;
        if (_histLen < _hist.length) pattern._histLen = _histLen + 1;

        return responses[idx];
    }

    // ── Public match ──────────────────────────────────────────────────────────
    /**
     * Returns a canned response if `input` matches any small-talk pattern, else null.
     *
     * Three matching passes (in order of strictness):
     *  1. Exact — O(1) Map lookup, also strips optional "james" prefix/suffix.
     *  2. Trie longest-prefix with word-boundary — O(L) walk, keeps deepest match,
     *     allows at most 10 trailing chars of short filler ("please", "ok?", "james").
     *  3. Fuzzy — Levenshtein ≤ 1 for inputs ≤ 40 chars (single-char typo tolerance).
     */
    match(input) {
        if (!input || typeof input !== 'string') return null;
        const normalized = this._normalize(input);
        
        if (!normalized) {
            // If the input normalizes to empty (only symbols/emojis/spaces)
            // check if it contains at least one pictographic emoji.
            if (/[\p{Extended_Pictographic}]/u.test(input)) {
                return this._pick(this._emojiPattern);
            }
            return null;
        }

        const j = 'james';

        // ── Pass 1: Exact match ──────────────────────────────────────────────
        let exactIdx = this._exactMap.get(normalized);

        if (exactIdx === undefined) {
            // Try stripping "james" prefix or suffix
            if (normalized.startsWith(j + ' ')) {
                exactIdx = this._exactMap.get(normalized.slice(j.length + 1));
            } else if (normalized.endsWith(' ' + j)) {
                exactIdx = this._exactMap.get(normalized.slice(0, -(j.length + 1)));
            }
        }

        if (exactIdx !== undefined) {
            return this._pick(this._patterns[exactIdx]);
        }

        // ── Pass 2: Trie longest-prefix with word-boundary ──────────────────
        // Walk the input once; keep the deepest end-of-word node.
        // Complexity: O(L) where L = length of normalised input.
        {
            let node = this._trie;
            let bestIdx = null;
            let bestLen = 0;
            for (let i = 0; i < normalized.length; i++) {
                const ch = normalized[i];
                if (!node.children.has(ch)) break;
                node = node.children.get(ch);
                // Record end-of-word only when followed by a boundary
                if (node.patternIndex !== null && this._isBoundary(normalized, i + 1)) {
                    bestIdx = node.patternIndex;
                    bestLen = i + 1;
                }
            }
            if (bestIdx !== null) {
                const tail = normalized.slice(bestLen).trim();
                // Allow short trailing filler ("please", "ok?", "james", etc.)
                if (tail.length <= 10) {
                    return this._pick(this._patterns[bestIdx]);
                }
            }
        }

        // ── Pass 3: Fuzzy (Levenshtein ≤ 1) ────────────────────────────────
        // Only for short inputs so cost stays bounded, and only for inputs >= 4 chars
        // to prevent drastic 1-char edits on tiny words (e.g. "ye" matching "bye").
        if (normalized.length >= 4 && normalized.length <= 40) {
            let bestDist = Infinity;
            let bestPatternIdx = -1;

            for (const { trigger, patternIndex } of this._fuzzyTriggers) {
                if (Math.abs(normalized.length - trigger.length) > 1) continue;
                const dist = this._editDistance(normalized, trigger, 1);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPatternIdx = patternIndex;
                    if (bestDist === 0) break;         // can't do better
                }
            }

            if (bestPatternIdx !== -1 && bestDist <= 1) {
                return this._pick(this._patterns[bestPatternIdx]);
            }
        }

        return null;
    }
}

export const smallTalk = new SmallTalkHandler();
