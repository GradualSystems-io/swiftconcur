const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

async function run() {
    try {
        const markdownPath = process.argv[2];
        const warningCount = parseInt(process.argv[3]);
        const newWarnings = parseInt(process.argv[4]);
        const fixedWarnings = parseInt(process.argv[5]);

        const token = process.env.GITHUB_TOKEN;
        const octokit = github.getOctokit(token);
        const context = github.context;

        if (!context.payload.pull_request) {
            console.log('Not a pull request, skipping comment');
            return;
        }

        const markdown = fs.readFileSync(markdownPath, 'utf8');

        // Create comment header
        const header = `## 🔍 SwiftConcur CI Results

| Metric | Count |
|--------|-------|
| Total Warnings | ${warningCount} |
| New Warnings | ${newWarnings > 0 ? `⚠️ ${newWarnings}` : `✅ ${newWarnings}`} |
| Fixed Warnings | ${fixedWarnings > 0 ? `🎉 ${fixedWarnings}` : fixedWarnings} |

`;

        const body = header + markdown;

        // Find existing comment
        const comments = await octokit.rest.issues.listComments({
            ...context.repo,
            issue_number: context.payload.pull_request.number,
        });

        const botComment = comments.data.find(comment => 
            comment.user.type === 'Bot' && 
            comment.body.includes('SwiftConcur CI Results')
        );

        if (botComment) {
            // Update existing comment
            await octokit.rest.issues.updateComment({
                ...context.repo,
                comment_id: botComment.id,
                body: body
            });
        } else {
            // Create new comment
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