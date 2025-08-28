const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

async function run() {
    try {
        const token = process.env.GITHUB_TOKEN;
        const octokit = github.getOctokit(token);
        const context = github.context;

        if (!context.payload.pull_request) {
            console.log('Not a pull request, skipping comment');
            return;
        }

        let body = '';

        // New compact mode: args = buildTimeHuman, deltaPct, actorCount, actorNewCount, top3, dashboardUrl
        if (process.argv.length >= 8) {
            const buildTimeHuman = process.argv[2];
            const deltaPct = process.argv[3];
            const actorCount = parseInt(process.argv[4]);
            const actorNew = parseInt(process.argv[5]);
            const top3 = process.argv[6] || '';
            const dashboardUrl = process.argv[7] || 'https://dashboard.swiftconcur.com';

            const title = '## ✅ SwiftConcur PR Check';
            const buildLine = `⏱ Build ${buildTimeHuman}${deltaPct && deltaPct.trim() !== '' ? ` (${deltaPct} vs baseline)` : ''}`;
            const actorLine = `⚠️ ${actorCount} actor-isolation warnings (${actorNew} new)${top3 ? `: ${top3}` : ''}`;
            const linkLine = `🔗 Details → ${dashboardUrl}`;

            body = [title, '', buildLine, actorLine, linkLine].join('\n');
        } else {
            // Fallback legacy mode
            const markdownPath = process.argv[2];
            const warningCount = parseInt(process.argv[3]);
            const newWarnings = parseInt(process.argv[4]);
            const fixedWarnings = parseInt(process.argv[5]);

            const markdown = fs.readFileSync(markdownPath, 'utf8');

            const header = `## 🔍 SwiftConcur CI Results\n\n| Metric | Count |\n|--------|-------|\n| Total Warnings | ${warningCount} |\n| New Warnings | ${newWarnings > 0 ? `⚠️ ${newWarnings}` : `✅ ${newWarnings}`} |\n| Fixed Warnings | ${fixedWarnings > 0 ? `🎉 ${fixedWarnings}` : fixedWarnings} |\n\n`;
            body = header + markdown;
        }

        // Find existing comment
        const comments = await octokit.rest.issues.listComments({
            ...context.repo,
            issue_number: context.payload.pull_request.number,
        });

        const botComment = comments.data.find(comment => 
            comment.user.type === 'Bot' && 
            (comment.body.includes('SwiftConcur PR Check') || comment.body.includes('SwiftConcur CI Results'))
        );

        if (botComment) {
            await octokit.rest.issues.updateComment({
                ...context.repo,
                comment_id: botComment.id,
                body: body
            });
        } else {
            await octokit.rest.issues.createComment({
                ...context.repo,
                issue_number: context.payload.pull_request.number,
                body: body
            });
        }

        console.log('✅ Comment posted successfully');
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
