const wordToNum = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000, million: 1000000
};

export class UserInputProcessor {
    /**
     * Process user input before it goes to the tool router.
     * This handles cases like stripping commas out of numbers (e.g. 1,000,000 -> 1000000)
     * and converting simple text numbers (e.g., 'one hundred' -> 100)
     * to prevent collisions with the currency tool or other regex matchers.
     * 
     * @param {string} text - The raw user input
     * @returns {string} - The processed input
     */
    static process(text) {
        if (!text || typeof text !== 'string') return text;
        
        let processed = text;
        
        // Remove commas from numbers if they act as thousands separators
        // We run this in a loop to handle multiple commas (e.g., 1,000,000)
        let previous;
        do {
            previous = processed;
            processed = processed.replace(/(\d),(\d{3})(?=(?:\D|$))/g, '$1$2');
        } while (processed !== previous);
        
        // Replace words with numbers (basic greedy matching for 1-100, etc.)
        // E.g., 'one hundred' -> '100'
        const regex = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/gi;
        
        processed = processed.replace(regex, (match) => {
            return wordToNum[match.toLowerCase()];
        });

        // Simple aggregation for compound words (e.g., twenty one -> 21)
        processed = processed.replace(/(\b\d+)\s+(\d+\b)/g, (match, p1, p2) => {
            let num1 = parseInt(p1);
            let num2 = parseInt(p2);
            if (num1 >= 20 && num1 <= 90 && num2 >= 1 && num2 <= 9) {
                return (num1 + num2).toString();
            }
            if (num1 >= 1 && num1 <= 999 && (num2 === 100 || num2 === 1000 || num2 === 1000000)) {
                return (num1 * num2).toString();
            }
            return match; // return original if not a compound we handle
        });

        return processed;
    }
}
