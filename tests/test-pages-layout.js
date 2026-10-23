import fs from 'fs';
import path from 'path';

let failed = 0;
function pass(msg) {
    console.log(`PASS: ${msg}`);
}
function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

// 1. Check pages/share.html scrollability and title
try {
    const shareHtml = fs.readFileSync('pages/share.html', 'utf8');
    
    if (shareHtml.includes('overflow-y: auto !important') && shareHtml.includes('height: auto !important')) {
        pass('share.html has overflow-y auto !important and height auto !important to enable scrolling');
    } else {
        fail('share.html missing overflow-y: auto !important or height: auto !important override');
    }

    if (/<h1[^>]*>[\s\S]*?<\/h1>/i.test(shareHtml)) {
        pass('share.html contains semantic <h1> heading');
    } else {
        fail('share.html is missing <h1> heading');
    }

    if (!shareHtml.includes('class="ascii-art"')) {
        pass('share.html has no unreadable ascii-art blocks');
    } else {
        fail('share.html contains ascii-art');
    }
} catch (e) {
    fail(`share.html test error: ${e.message}`);
}

// 2. Check pages/about.html title and readability
try {
    const aboutHtml = fs.readFileSync('pages/about.html', 'utf8');
    
    if (/<h1[^>]*class="[^"]*hero-title[^"]*"[^>]*>[\s\S]*?<\/h1>/i.test(aboutHtml)) {
        pass('about.html contains crisp, readable <h1 class="hero-title"> heading');
    } else {
        fail('about.html is missing <h1 class="hero-title">');
    }

    const heroSectionMatch = aboutHtml.match(/<section[^>]*class="hero"[\s\S]*?<\/section>/i);
    if (heroSectionMatch && !heroSectionMatch[0].includes('class="ascii-art"')) {
        pass('about.html hero has no illegible ascii-art banner');
    } else {
        fail('about.html hero still contains ascii-art banner');
    }

    if (aboutHtml.includes('overflow: auto') || aboutHtml.includes('overflow-y: auto')) {
        pass('about.html has body overflow auto for scrolling');
    } else {
        fail('about.html is missing scrollable overflow setting');
    }
} catch (e) {
    fail(`about.html test error: ${e.message}`);
}

// 3. Check pages/docs.html title, readability, and scrollability
try {
    const docsHtml = fs.readFileSync('pages/docs.html', 'utf8');
    
    if (/<div[^>]*class="page-header"[\s\S]*?<h1[^>]*>[\s\S]*?<\/h1>/i.test(docsHtml)) {
        pass('docs.html page-header contains clear, readable <h1> heading');
    } else {
        fail('docs.html page-header is missing <h1>');
    }

    const pageHeaderMatch = docsHtml.match(/<div[^>]*class="page-header"[\s\S]*?<\/div>/i);
    if (pageHeaderMatch && !pageHeaderMatch[0].includes('class="ascii-art"')) {
        pass('docs.html page-header has no unreadable ascii-art block');
    } else {
        fail('docs.html page-header still contains ascii-art');
    }

    if (docsHtml.includes('overflow-y: auto')) {
        pass('docs.html body has overflow-y auto for scrolling');
    } else {
        fail('docs.html is missing overflow-y auto');
    }
} catch (e) {
    fail(`docs.html test error: ${e.message}`);
}

if (failed === 0) {
    console.log("ALL PASSED");
    process.exit(0);
} else {
    process.exit(1);
}
