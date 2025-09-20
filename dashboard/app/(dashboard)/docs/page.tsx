import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { BookOpen, Github, ExternalLink, Copy, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import Link from 'next/link';

const analyticsWorkflowStep = [
  '      - name: Send data to Dashboard',
  '        if: always()',
  '        env:',
  '          WEBHOOK_SECRET: ${{ secrets.GITHUB_WEBHOOK_SECRET }}',
  '        run: |',
  '          INSTALLATION_ID="${{ github.event.installation.id }}"',
  '          INSTALLATION_JSON=null',
  '          if [ -n "$INSTALLATION_ID" ]; then',
  '            INSTALLATION_JSON=$INSTALLATION_ID',
  '          else',
  '            echo "ℹ️ No installation id on this event; proceeding without it."',
  '          fi',
  '',
  '          WARNING_COUNT="${{ steps.swiftconcur.outputs.warning-count || 0 }}"',
  '          NEW_WARNINGS="${{ steps.swiftconcur.outputs.new-warnings || 0 }}"',
  '          FIXED_WARNINGS="${{ steps.swiftconcur.outputs.fixed-warnings || 0 }}"',
  '          BUILD_TIME="${{ steps.swiftconcur.outputs.build-time-seconds || 0 }}"',
  '          JSON_REPORT="${{ steps.swiftconcur.outputs.json-report }}"',
  "          WARNINGS_JSON='[]'",
  '          if [ -f "$JSON_REPORT" ]; then',
  '            WARNINGS_JSON=$(jq -c \'.warnings // []\' "$JSON_REPORT" 2>/dev/null || echo \'[]\')',
  '          fi',
  '',
  '          SUMMARY_MD="${{ steps.swiftconcur.outputs.summary-markdown }}"',
  '          SUMMARY_TEXT="SwiftConcur detected $WARNING_COUNT warnings (new: $NEW_WARNINGS, fixed: $FIXED_WARNINGS)."',
  '          if [ -f "$SUMMARY_MD" ]; then',
  '            SUMMARY_TEXT=$(head -n 200 "$SUMMARY_MD")',
  '          fi',
  '',
  '          jq -n \\',
  '            --argjson installation_id "$INSTALLATION_JSON" \\',
  '            --arg repo_id "${{ github.event.repository.id }}" \\',
  '            --arg repo_name "${{ github.event.repository.name }}" \\',
  '            --arg repo_full "${{ github.repository }}" \\',
  '            --argjson repo_private "${{ github.event.repository.private }}" \\',
  '            --arg repo_default_branch "${{ github.event.repository.default_branch }}" \\',
  '            --arg head_sha "${{ github.sha }}" \\',
  '            --arg head_branch "${{ github.ref_name }}" \\',
  '            --arg workflow_url "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \\',
  '            --argjson warning_count "$WARNING_COUNT" \\',
  '            --argjson new_warnings "$NEW_WARNINGS" \\',
  '            --argjson fixed_warnings "$FIXED_WARNINGS" \\',
  '            --argjson build_time "$BUILD_TIME" \\',
  '            --arg summary "$SUMMARY_TEXT" \\',
  '            --arg json_report "$JSON_REPORT" \\',
  '            --argjson warnings "$WARNINGS_JSON" \\',
  "            '{",
  '              action: "warning_report",',
  '              installation: (if $installation_id == null then null else { id: $installation_id } end),',
  '              repository: {',
  '                id: ($repo_id | tonumber),',
  '                name: $repo_name,',
  '                full_name: $repo_full,',
  '                private: $repo_private,',
  '                default_branch: $repo_default_branch',
  '              },',
  '              workflow_run: {',
  '                head_sha: $head_sha,',
  '                head_branch: $head_branch,',
  '                conclusion: "success",',
  '                html_url: $workflow_url',
  '              },',
  '              swiftconcur: {',
  '                warning_count: $warning_count,',
  '                new_warnings: $new_warnings,',
  '                fixed_warnings: $fixed_warnings,',
  '                build_time_seconds: $build_time,',
  '                summary: $summary,',
  '                json_report_path: $json_report,',
  '                warnings: $warnings',
  '              }',
  "            }' > /tmp/webhook_payload.json",
  '',
  '          if [ -z "$WEBHOOK_SECRET" ]; then',
  '            echo "⚠️ WEBHOOK_SECRET not set; skipping signature header."',
  '            curl -sS -X POST "https://gradualsystems.io/SwiftConcur/api/github/webhook" \\',
  '              -H "Content-Type: application/json" \\',
  '              -H "X-GitHub-Event: swiftconcur_warning" \\',
  '              -H "X-GitHub-Delivery: swiftconcur-${{ github.run_id }}" \\',
  '              -H "User-Agent: GitHub-Actions" \\',
  "              --data '@/tmp/webhook_payload.json' \\",
  '              --fail || echo "Analytics webhook failed"',
  '          else',
  '            SIG_VALUE=$(openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" /tmp/webhook_payload.json | awk \'{print $NF}\')',
  '            curl -sS -X POST "https://gradualsystems.io/SwiftConcur/api/github/webhook" \\',
  '              -H "Content-Type: application/json" \\',
  '              -H "X-GitHub-Event: swiftconcur_warning" \\',
  '              -H "X-GitHub-Delivery: swiftconcur-${{ github.run_id }}" \\',
  '              -H "X-Hub-Signature-256: sha256=$SIG_VALUE" \\',
  '              -H "User-Agent: GitHub-Actions" \\',
  "              --data '@/tmp/webhook_payload.json' \\",
  '              --fail || echo "Analytics webhook failed"',
  '          fi',
  '',
].join('\n');

const analyticsWebhookStep = [
  '      - name: Send data to Dashboard',
  '        if: always()',
  '        env:',
  '          WEBHOOK_SECRET: \\\\${{ secrets.GITHUB_WEBHOOK_SECRET }}',
  '        run: |',
  '          INSTALLATION_ID="\\\\${{ github.event.installation.id }}"',
  '          INSTALLATION_JSON=null',
  '          if [ -n "$INSTALLATION_ID" ]; then',
  '            INSTALLATION_JSON=$INSTALLATION_ID',
  '          else',
  '            echo "ℹ️ No installation id on this event; proceeding without it."',
  '          fi',
  '',
  '          WARNING_COUNT="\\\\${{ steps.swiftconcur.outputs.warning-count || 0 }}"',
  '          NEW_WARNINGS="\\\\${{ steps.swiftconcur.outputs.new-warnings || 0 }}"',
  '          FIXED_WARNINGS="\\\\${{ steps.swiftconcur.outputs.fixed-warnings || 0 }}"',
  '          BUILD_TIME="\\\\${{ steps.swiftconcur.outputs.build-time-seconds || 0 }}"',
  '',
  '          JSON_REPORT="\\\\${{ steps.swiftconcur.outputs.json-report }}"',
  "          WARNINGS_JSON='[]'",
  '          if [ -f "$JSON_REPORT" ]; then',
  '            WARNINGS_JSON=$(jq -c \'.warnings // []\' "$JSON_REPORT" 2>/dev/null || echo \'[]\')',
  '          fi',
  '',
  '          SUMMARY_MD="\\\\${{ steps.swiftconcur.outputs.summary-markdown }}"',
  '          SUMMARY_TEXT="SwiftConcur detected $WARNING_COUNT warnings (new: $NEW_WARNINGS, fixed: $FIXED_WARNINGS)."',
  '          if [ -f "$SUMMARY_MD" ]; then',
  '            SUMMARY_TEXT=$(head -n 200 "$SUMMARY_MD")',
  '          fi',
  '',
  '          jq -n \\',
  '            --argjson installation_id "$INSTALLATION_JSON" \\',
  '            --arg repo_id "\\\\${{ github.event.repository.id }}" \\',
  '            --arg repo_name "\\\\${{ github.event.repository.name }}" \\',
  '            --arg repo_full "\\\\${{ github.repository }}" \\',
  '            --argjson repo_private "\\\\${{ github.event.repository.private }}" \\',
  '            --arg repo_default_branch "\\\\${{ github.event.repository.default_branch }}" \\',
  '            --arg head_sha "\\\\${{ github.sha }}" \\',
  '            --arg head_branch "\\\\${{ github.ref_name }}" \\',
  '            --arg workflow_url "\\\\${{ github.server_url }}/${{ github.repository }}/actions/runs/\\\\${{ github.run_id }}" \\',
  '            --argjson warning_count "$WARNING_COUNT" \\',
  '            --argjson new_warnings "$NEW_WARNINGS" \\',
  '            --argjson fixed_warnings "$FIXED_WARNINGS" \\',
  '            --argjson build_time "$BUILD_TIME" \\',
  '            --arg summary "$SUMMARY_TEXT" \\',
  '            --arg json_report "$JSON_REPORT" \\',
  '            --argjson warnings "$WARNINGS_JSON" \\',
  "            '{",
  '              action: "warning_report",',
  '              installation: (if $installation_id == null then null else { id: $installation_id } end),',
  '              repository: {',
  '                id: ($repo_id | tonumber),',
  '                name: $repo_name,',
  '                full_name: $repo_full,',
  '                private: $repo_private,',
  '                default_branch: $repo_default_branch',
  '              },',
  '              workflow_run: {',
  '                head_sha: $head_sha,',
  '                head_branch: $head_branch,',
  '                conclusion: "success",',
  '                html_url: $workflow_url',
  '              },',
  '              swiftconcur: {',
  '                warning_count: $warning_count,',
  '                new_warnings: $new_warnings,',
  '                fixed_warnings: $fixed_warnings,',
  '                build_time_seconds: $build_time,',
  '                summary: $summary,',
  '                json_report_path: $json_report,',
  '                warnings: $warnings',
  '              }',
  "            }' > /tmp/swiftconcur_payload.json",
  '',
  '          if [ -z "$WEBHOOK_SECRET" ]; then',
  '            echo "⚠️ WEBHOOK_SECRET not set; skipping signature header."',
  '            curl -sS -X POST "https://gradualsystems.io/SwiftConcur/api/github/webhook" \\',
  '              -H "Content-Type: application/json" \\',
  '              -H "X-GitHub-Event: swiftconcur_warning" \\',
  '              -H "X-GitHub-Delivery: swiftconcur-\\\\${{ github.run_id }}" \\',
  '              -H "User-Agent: GitHub-Actions" \\',
  "              --data '@/tmp/swiftconcur_payload.json' \\",
  '              --fail || echo "Analytics webhook failed"',
  '          else',
  '            SIG_VALUE=$(openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" /tmp/swiftconcur_payload.json | awk \'{print $NF}\')',
  '            curl -sS -X POST "https://gradualsystems.io/SwiftConcur/api/github/webhook" \\',
  '              -H "Content-Type: application/json" \\',
  '              -H "X-GitHub-Event: swiftconcur_warning" \\',
  '              -H "X-GitHub-Delivery: swiftconcur-\\\\${{ github.run_id }}" \\',
  '              -H "X-Hub-Signature-256: sha256=$SIG_VALUE" \\',
  '              -H "User-Agent: GitHub-Actions" \\',
  "              --data '@/tmp/swiftconcur_payload.json' \\",
  '              --fail || echo "Analytics webhook failed"',
  '          fi',
  '',
].join('\n');

const analyticsWebhookWithGuard = [
  '      # ...existing steps...',
  '      - name: Send data to Dashboard',
  '        if: always()',
  '        env:',
  '          WEBHOOK_SECRET: \\\\${{ secrets.GITHUB_WEBHOOK_SECRET }}',
  '        run: |',
  '          INSTALLATION_ID="\\\\${{ github.event.installation.id }}"',
  '          if [ -z "$INSTALLATION_ID" ]; then',
  '            echo "Skipping analytics webhook: missing installation id"',
  '            exit 0',
  '          fi',
  '',
  '          WARNING_COUNT="\\\\${{ steps.swiftconcur.outputs.warning-count || 0 }}"',
  '          NEW_WARNINGS="\\\\${{ steps.swiftconcur.outputs.new-warnings || 0 }}"',
  '          FIXED_WARNINGS="\\\\${{ steps.swiftconcur.outputs.fixed-warnings || 0 }}"',
  '          BUILD_TIME="\\\\${{ steps.swiftconcur.outputs.build-time-seconds || 0 }}"',
  '          JSON_REPORT="\\\\${{ steps.swiftconcur.outputs.json-report }}"',
  "          WARNINGS_JSON='[]'",
  '          if [ -f "$JSON_REPORT" ]; then',
  '            WARNINGS_JSON=$(jq -c \'.warnings // []\' "$JSON_REPORT" 2>/dev/null || echo \'[]\')',
  '          fi',
  '',
  '          SUMMARY_MD="\\\\${{ steps.swiftconcur.outputs.summary-markdown }}"',
  '          SUMMARY_TEXT="SwiftConcur detected $WARNING_COUNT warnings (new: $NEW_WARNINGS, fixed: $FIXED_WARNINGS)."',
  '          if [ -f "$SUMMARY_MD" ]; then',
  '            SUMMARY_TEXT=$(head -n 200 "$SUMMARY_MD")',
  '          fi',
  '',
  '          jq -n --argjson installation_id "$INSTALLATION_JSON" --arg repo_id "\\\\${{ github.event.repository.id }}" --arg repo_name "\\\\${{ github.event.repository.name }}" --arg repo_full "\\\\${{ github.repository }}" --argjson repo_private "\\\\${{ github.event.repository.private }}" --arg repo_default_branch "\\\\${{ github.event.repository.default_branch }}" --arg head_sha "\\\\${{ github.sha }}" --arg head_branch "\\\\${{ github.ref_name }}" --arg workflow_url "\\\\${{ github.server_url }}/${{ github.repository }}/actions/runs/\\\\${{ github.run_id }}" --argjson warning_count "$WARNING_COUNT" --argjson new_warnings "$NEW_WARNINGS" --argjson fixed_warnings "$FIXED_WARNINGS" --argjson build_time "$BUILD_TIME" --arg summary "$SUMMARY_TEXT" --arg json_report "$JSON_REPORT" --argjson warnings "$WARNINGS_JSON" \'{',
  '            action: "warning_report",',
  '            installation: (if $installation_id == null then null else { id: $installation_id } end),',
  '            repository: {',
  '              id: ($repo_id | tonumber),',
  '              name: $repo_name,',
  '              full_name: $repo_full,',
  '              private: $repo_private,',
  '              default_branch: $repo_default_branch',
  '            },',
  '            workflow_run: {',
  '              head_sha: $head_sha,',
  '              head_branch: $head_branch,',
  '              conclusion: "success",',
  '              html_url: $workflow_url',
  '            },',
  '            swiftconcur: {',
  '              warning_count: $warning_count,',
  '              new_warnings: $new_warnings,',
  '              fixed_warnings: $fixed_warnings,',
  '              build_time_seconds: $build_time,',
  '              summary: $summary,',
  '              json_report_path: $json_report,',
  '              warnings: $warnings',
  '            }',
  "          }' > /tmp/swiftconcur_payload.json",
  '',
  '          SIG_HEADER=""',
  '          if [ -n "$WEBHOOK_SECRET" ]; then',
  '            SIG_VALUE=$(openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" /tmp/swiftconcur_payload.json | awk \'{print $NF}\')',
  '            SIG_HEADER="-H \\"X-Hub-Signature-256: sha256=$SIG_VALUE\\""',
  '          fi',
  '',
  '          eval curl -X POST "https://gradualsystems.io/SwiftConcur/api/github/webhook" \\',
  '            -H "Content-Type: application/json" \\',
  '            -H "X-GitHub-Event: swiftconcur_warning" \\',
  '            -H "X-GitHub-Delivery: swiftconcur-\\\\${{ github.run_id }}" \\',
  '            -H "User-Agent: GitHub-Actions" \\',
  '            $SIG_HEADER \\',
  "            --data '@/tmp/swiftconcur_payload.json' \\",
  '            --fail --silent --show-error || echo "Analytics webhook failed"',
  '',
].join('\n');


export default function DocumentationPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-2">
          Complete guide to setting up and using SwiftConcur CI for Swift concurrency monitoring
        </p>
      </div>

      {/* Quick Start */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Quick Start
          </CardTitle>
          <CardDescription>
            Get up and running with SwiftConcur CI in under 5 minutes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">1</div>
              <h3 className="font-semibold mb-1">Connect Repository</h3>
              <p className="text-sm text-muted-foreground">Link your GitHub repository with SwiftConcur CI</p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/50 rounded-lg">
              <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">2</div>
              <h3 className="font-semibold mb-1">Add GitHub Action</h3>
              <p className="text-sm text-muted-foreground">Configure the workflow in your repository</p>
            </div>
            <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/50 rounded-lg">
              <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 font-bold">3</div>
              <h3 className="font-semibold mb-1">Start Monitoring</h3>
              <p className="text-sm text-muted-foreground">Push code and get instant concurrency insights</p>
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button asChild>
              <Link href="/repositories">
                Connect Your First Repository
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a href="https://github.com/swiftconcur/swiftconcur-ci" target="_blank">
                <Github className="h-4 w-4 mr-2" />
                View on GitHub
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* GitHub Action Setup */}
      <Card>
        <CardHeader>
          <CardTitle>GitHub Action Configuration</CardTitle>
          <CardDescription>
            Add SwiftConcur CI to your workflow file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create or update <code className="bg-muted px-1 py-0.5 rounded">.github/workflows/swiftconcur.yml</code> in your repository:
          </p>
          
          <div className="relative">
            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto text-sm">
{analyticsWorkflowStep}
            </pre>
            <CopyButton
              text={analyticsWorkflowStep}
              className="absolute top-2 right-2"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Required Parameters</h4>
              <ul className="text-sm space-y-1">
                <li><code className="bg-muted px-1 py-0.5 rounded">scheme</code> - Your Xcode scheme name</li>
                <li><code className="bg-muted px-1 py-0.5 rounded">workspace-path</code> OR <code className="bg-muted px-1 py-0.5 rounded">project-path</code></li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Optional Parameters</h4>
              <ul className="text-sm space-y-1">
                <li><code className="bg-muted px-1 py-0.5 rounded">configuration</code> - Build configuration (Debug/Release)</li>
                <li><code className="bg-muted px-1 py-0.5 rounded">threshold</code> - Maximum warnings allowed</li>
                <li><code className="bg-muted px-1 py-0.5 rounded">ai-summaries</code> - Enable AI insights</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Enable Dashboard Analytics
          </CardTitle>
          <CardDescription>
            Send SwiftConcur run results back to the dashboard so the analytics tab can track health trends
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li>
              <strong>Create a webhook secret:</strong> add <code className="bg-muted px-1 py-0.5 rounded">GITHUB_WEBHOOK_SECRET</code> (or choose your own name) to your repository or organisation secrets. Use the same value that is configured for the GitHub App in the dashboard.
            </li>
            <li>
              <strong>Append a dashboard step:</strong> after the SwiftConcur action, add a step that posts the results to <code className="bg-muted px-1 py-0.5 rounded">https://gradualsystems.io/SwiftConcur/api/github/webhook</code>. This ensures data lands in <code className="bg-muted px-1 py-0.5 rounded">warning_runs</code>, <code className="bg-muted px-1 py-0.5 rounded">warnings</code> and <code className="bg-muted px-1 py-0.5 rounded">repository_warning_daily</code> for the Analytics page.
            </li>
            <li>
              <strong>Verify installs:</strong> runs must execute inside the GitHub App installation context so <code className="bg-muted px-1 py-0.5 rounded">github.event.installation.id</code> is populated. That value is required to associate runs with the correct repository in Supabase.
            </li>
          </ol>

          <div className="relative">
            <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto text-sm">
{analyticsWebhookStep}
            </pre>
            <CopyButton
              text={analyticsWebhookWithGuard}
              className="absolute top-2 right-2"
            />
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Tip:</strong> keep all of these commands inside the same workflow job that runs the SwiftConcur action so the step outputs (warning counts, summary, report path) are available.
            </p>
            <p>
              Once the step runs successfully you&apos;ll see data in the Analytics tab within a minute of each workflow finishing.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Warning Types */}
      <Card>
        <CardHeader>
          <CardTitle>Swift Concurrency Warning Types</CardTitle>
          <CardDescription>
            Understanding the warnings detected by SwiftConcur CI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="border-l-4 border-red-500 pl-4">
                <h4 className="font-semibold text-red-700 dark:text-red-400">Actor Isolation</h4>
                <p className="text-sm text-muted-foreground">
                  Violations of actor isolation boundaries that could lead to data races
                </p>
                <code className="text-xs bg-red-50 dark:bg-red-950/50 px-2 py-1 rounded">
                  actor-isolated property cannot be referenced
                </code>
              </div>
              
              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold text-orange-700 dark:text-orange-400">Sendable Conformance</h4>
                <p className="text-sm text-muted-foreground">
                  Types that don't conform to Sendable protocol when required
                </p>
                <code className="text-xs bg-orange-50 dark:bg-orange-950/50 px-2 py-1 rounded">
                  does not conform to the 'Sendable' protocol
                </code>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="border-l-4 border-yellow-500 pl-4">
                <h4 className="font-semibold text-yellow-700 dark:text-yellow-400">Data Race Detection</h4>
                <p className="text-sm text-muted-foreground">
                  Potential data races in concurrent code execution
                </p>
                <code className="text-xs bg-yellow-50 dark:bg-yellow-950/50 px-2 py-1 rounded">
                  data race detected in async context
                </code>
              </div>
              
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold text-blue-700 dark:text-blue-400">Performance Issues</h4>
                <p className="text-sm text-muted-foreground">
                  Inefficient concurrency patterns that impact performance
                </p>
                <code className="text-xs bg-blue-50 dark:bg-blue-950/50 px-2 py-1 rounded">
                  unnecessary async/await pattern
                </code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features by Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Features by Plan</CardTitle>
          <CardDescription>
            What's included in each SwiftConcur CI plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Free Plan */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-2">Free</h3>
              <p className="text-2xl font-bold mb-4">$0<span className="text-sm font-normal text-muted-foreground">/month</span></p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Public repositories
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  500 warnings/month
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Basic dashboard
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  7-day history
                </li>
              </ul>
            </div>

            {/* Pro Plan */}
            <div className="border-2 border-blue-500 rounded-lg p-4 relative">
              <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                <span className="bg-blue-500 text-white px-3 py-1 rounded text-xs font-medium">Popular</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Pro</h3>
              <p className="text-2xl font-bold mb-4">$12<span className="text-sm font-normal text-muted-foreground">/month</span></p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Private repositories
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  20,000 warnings/month
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  AI-powered summaries
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  12-month history
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Slack/Teams integration
                </li>
              </ul>
            </div>

            {/* Enterprise Plan */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-2">Enterprise</h3>
              <p className="text-2xl font-bold mb-4">$99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Unlimited warnings
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  SSO & SCIM
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Unlimited history
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Priority support
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  SLA guarantees
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
          <CardDescription>
            Common issues and solutions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="border-l-4 border-yellow-500 pl-4 py-2">
              <h4 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Build failing with scheme not found
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Ensure the <code className="bg-muted px-1 py-0.5 rounded">scheme</code> parameter matches exactly 
                with your Xcode scheme name (case-sensitive).
              </p>
            </div>

            <div className="border-l-4 border-blue-500 pl-4 py-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Info className="h-4 w-4" />
                No warnings detected in working repository
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Make sure your project uses Swift concurrency features (async/await, actors, etc.). 
                The action only reports Swift concurrency-related warnings.
              </p>
            </div>

            <div className="border-l-4 border-red-500 pl-4 py-2">
              <h4 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                GitHub Action permission denied
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Verify your GitHub personal access token has <code className="bg-muted px-1 py-0.5 rounded">repo</code> and{' '}
                <code className="bg-muted px-1 py-0.5 rounded">admin:repo_hook</code> permissions.
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
              Still need help?
            </h4>
            <p className="text-blue-700 dark:text-blue-300 text-sm mb-3">
              Can't find what you're looking for? We're here to help!
            </p>
            <div className="flex gap-3">
              <Button size="sm" variant="outline" asChild>
                <a href="mailto:support@swiftconcur.dev">
                  Contact Support
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href="https://github.com/swiftconcur/swiftconcur-ci/issues" target="_blank">
                  <Github className="h-3 w-3 mr-1" />
                  GitHub Issues
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
