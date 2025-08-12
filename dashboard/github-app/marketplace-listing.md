# SwiftConcur CI

## Tagline
Track Swift 6 concurrency warnings before they reach production

## Description
SwiftConcur CI automatically detects and tracks Swift concurrency issues in your CI/CD pipeline, including:

- **Actor isolation violations** - Catch unsafe cross-actor references
- **Sendable conformance issues** - Identify types that aren't thread-safe
- **Data races** - Find potential race conditions before they cause crashes
- **Performance regressions** - Monitor concurrency-related performance issues

### Key Features

#### 🤖 AI-Powered Summaries (Pro & Enterprise)
Get intelligent summaries of your warnings with actionable recommendations powered by GPT-4.

#### 📊 Historical Trends
Track warning trends over time to ensure your codebase is improving, not regressing.

#### 🔔 Team Notifications
Get alerts in Slack, Microsoft Teams, or email when new issues are introduced.

#### 🎯 Quality Gates
Set thresholds and fail builds when critical concurrency issues are detected.

#### 📈 Public Badges
Show your commitment to thread safety with embeddable status badges.

### Getting Started

1. Install from GitHub Marketplace
2. Add the GitHub Action to your workflow:
   ```yaml
   - uses: swiftconcur/swiftconcur-ci@v1
     with:
       api-key: ${{ secrets.SWIFTCONCUR_API_KEY }}
       scheme: 'YourScheme'
   ```
3. View results in your dashboard at swiftconcur.dev

### Pricing

- **Free**: Perfect for open source projects
- **Pro ($12/repo/month)**: For professional developers and small teams
- **Enterprise**: Custom pricing for large organizations

## Support & Documentation

- 📚 [Documentation](https://docs.swiftconcur.dev)
- 💬 [Community Forum](https://community.swiftconcur.dev)
- 📧 [Email Support](mailto:support@swiftconcur.dev)

## Categories
- Continuous Integration
- Code Quality
- Swift