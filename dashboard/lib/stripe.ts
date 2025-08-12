import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

// Initialize Stripe with security configurations
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true,
  // Security: Use latest API version and enable telemetry for monitoring
  telemetry: true,
  // Timeout configuration for security
  timeout: 10000, // 10 seconds
  maxNetworkRetries: 3,
});

// Security: Webhook signature verification
export function verifyStripeWebhook(
  body: string | Buffer,
  signature: string | string[] | undefined,
  secret: string
): Stripe.Event {
  if (!signature) {
    throw new Error('Missing stripe signature');
  }

  try {
    return stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    throw new Error(`Webhook signature verification failed: ${error}`);
  }
}

// Security: Validate customer email matches authenticated user
export async function validateCustomerOwnership(
  customerId: string,
  userEmail: string
): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) {
      return false;
    }
    
    return customer.email === userEmail;
  } catch (error) {
    console.error('Error validating customer ownership:', error);
    return false;
  }
}

// Security: Create customer with metadata for tracking
export async function createStripeCustomer(
  email: string,
  userId: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email,
    metadata: {
      userId,
      source: 'swiftconcur_dashboard',
      ...metadata,
    },
  });
}

// Security: Restricted customer update - only allow specific fields
export async function updateStripeCustomer(
  customerId: string,
  updates: {
    email?: string;
    name?: string;
    metadata?: Record<string, string>;
  }
): Promise<Stripe.Customer> {
  const allowedUpdates: Stripe.CustomerUpdateParams = {};
  
  if (updates.email) allowedUpdates.email = updates.email;
  if (updates.name) allowedUpdates.name = updates.name;
  if (updates.metadata) allowedUpdates.metadata = updates.metadata;
  
  return stripe.customers.update(customerId, allowedUpdates);
}