/**
 * GitHub webhook endpoint
 * Receives and processes GitHub App events
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { GH_APP_CONFIG, verifyWebhookSignature } from '@/lib/github/app';
import { processWebhookEvent } from '@/lib/github/webhooks';
import { 
  getInstallationWebhookSecret,
  getWebhookSecretForRepository,
} from '@/lib/github/secrets';

export async function POST(request: NextRequest) {
  try {
    // Get webhook headers
    const headersList = headers();
    const signature = headersList.get('x-hub-signature-256');
    const deliveryId = headersList.get('x-github-delivery');
    const eventType = headersList.get('x-github-event');

    if (!deliveryId || !eventType) {
      console.error('Missing required webhook headers');
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();

    const secretsToTry = new Set<string>();
    if (GH_APP_CONFIG.webhookSecret) {
      secretsToTry.add(GH_APP_CONFIG.webhookSecret);
    }

    let parsedPayload: any | null = null;
    try {
      parsedPayload = JSON.parse(rawBody);
    } catch (error) {
      // Delay JSON error handling until after signature verification
      console.warn('Webhook payload JSON parse failed before verification:', error);
    }

    if (parsedPayload) {
      const installationId: number | undefined = parsedPayload.installation?.id;

      if (installationId) {
        const installationSecret = await getInstallationWebhookSecret(installationId);
        if (installationSecret) {
          secretsToTry.add(installationSecret);
        }
      }

      if (!installationId && parsedPayload.repository) {
        const repoId = parsedPayload.repository.id as number | undefined;
        const repoFullName = parsedPayload.repository.full_name as string | undefined;
        const { secret: repoSecret } = await getWebhookSecretForRepository(repoId, repoFullName);
        if (repoSecret) {
          secretsToTry.add(repoSecret);
        }
      }
    }

    const requireSignature = secretsToTry.size > 0;

    if (!requireSignature) {
      console.log('No webhook secret configured for this installation; accepting unsigned payload.');
    } else {
      if (!signature) {
        console.error(`Missing webhook signature for delivery: ${deliveryId}`);
        return NextResponse.json(
          { error: 'Missing webhook signature' },
          { status: 401 }
        );
      }

      let signatureValid = false;
      for (const candidate of secretsToTry) {
        if (!candidate) continue;
        if (await verifyWebhookSignature(rawBody, signature, candidate)) {
          signatureValid = true;
          break;
        }
      }

      if (!signatureValid) {
        console.error(`Invalid webhook signature for delivery: ${deliveryId}`);
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    // Parse payload
    let payload = parsedPayload;
    if (!payload) {
      try {
        payload = JSON.parse(rawBody);
      } catch (error) {
        console.error('Invalid JSON payload:', error);
        return NextResponse.json(
          { error: 'Invalid JSON payload' },
          { status: 400 }
        );
      }
    }

    // Log webhook for debugging
    console.log(`Webhook received: ${eventType} (${payload.action}) - ${deliveryId}`);

    // Process the webhook event
    await processWebhookEvent(eventType, payload, deliveryId);

    // Return success
    return NextResponse.json({ 
      success: true,
      event: eventType,
      action: payload.action,
      delivery_id: deliveryId,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook processing error:', errorMessage);

    // Return error but don't expose internal details
    return NextResponse.json(
      { 
        error: 'Internal server error',
        delivery_id: headers().get('x-github-delivery'),
      },
      { status: 500 }
    );
  }
}

// Handle GET requests for webhook validation
export async function GET() {
  return NextResponse.json({ 
    message: 'SwiftConcur GitHub webhook endpoint',
    timestamp: new Date().toISOString(),
  });
}
