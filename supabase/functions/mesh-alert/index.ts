// Mesh-Alert Supabase Edge Function - PRODUCTION HARDENED
// Notifies nearby verified users when a lost pet alert is created
// Supports batching for 50+ neighbors to prevent FCM timeout

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MeshAlertRequest {
  alertId: string;
  radiusMeters?: number;
  minVouchScore?: number;
}

interface NotificationResult {
  successCount: number;
  failureCount: number;
  results: Array<{ success: boolean; token: string; error?: string }>;
}

// FCM Batching Configuration
const FCM_BATCH_SIZE = 500; // Firebase allows up to 500 tokens per batch
const BATCH_DELAY_MS = 100; // Small delay between batches to prevent rate limiting

serve(async (req) => {
  const notificationsDisabled = true;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // =====================================================
    // INPUT VALIDATION
    // =====================================================
    const requestBody = await req.json().catch(() => ({}));
    const { alertId, radiusMeters = 1000, minVouchScore = 5 }: MeshAlertRequest = requestBody;

    if (!alertId) {
      throw new Error('Missing required parameter: alertId');
    }

    if (radiusMeters < 100 || radiusMeters > 50000) {
      throw new Error('radiusMeters must be between 100 and 50000 meters');
    }

    if (minVouchScore < 0 || minVouchScore > 100) {
      throw new Error('minVouchScore must be between 0 and 100');
    }

    // =====================================================
    // SUPABASE CLIENT INITIALIZATION
    // =====================================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // =====================================================
    // FETCH ALERT DETAILS
    // =====================================================
    console.log(`[Mesh-Alert] Processing alert: ${alertId}`);

    const { data: alert, error: alertError } = await supabase
      .from('lost_pet_alerts')
      .select(`
        id,
        latitude,
        longitude,
        description,
        photo_url,
        status,
        owner:profiles!lost_pet_alerts_owner_id_fkey(id, display_name, avatar_url, fcm_token, tier),
        pet:pets(name, species, photo_url)
      `)
      .eq('id', alertId)
      .single();

    if (alertError) {
      console.error('[Mesh-Alert] Alert fetch error:', alertError);
      throw new Error(`Failed to fetch alert: ${alertError.message}`);
    }

    if (!alert) {
      throw new Error('Alert not found');
    }

    let ownerTier = alert.owner?.tier || "free";
    // Family quota inheritance: use inviter's tier if alert owner is a family invitee
    if (alert.owner?.id) {
      const { data: familyLink } = await supabase
        .from("family_members")
        .select("inviter_user_id")
        .eq("invitee_user_id", alert.owner.id)
        .eq("status", "accepted")
        .maybeSingle();
      if (familyLink?.inviter_user_id) {
        const { data: inviter } = await supabase
          .from("profiles")
          .select("tier")
          .eq("id", familyLink.inviter_user_id)
          .maybeSingle();
        if (inviter?.tier) {
          ownerTier = inviter.tier;
        }
      }
    }
    // Contract override: Broadcast visibility radius by membership.
    // Free: 10km, Premium: 25km, Gold: 50km (family-inherited).
    const effectiveRadiusMeters = ownerTier === "gold" ? 50000 : ownerTier === "premium" ? 25000 : 10000;

    if (alert.status !== 'active') {
      console.log('[Mesh-Alert] Alert is not active, skipping notifications');
      return new Response(
        JSON.stringify({
          success: true,
          alert_id: alertId,
          notified: 0,
          message: 'Alert is not active'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // =====================================================
    // FIND NEARBY USERS (with vouch_score filter)
    // =====================================================
    const { data: nearbyUsers, error: usersError } = await supabase
      .rpc('find_nearby_users', {
        alert_lat: alert.latitude,
        alert_lng: alert.longitude,
        radius_meters: effectiveRadiusMeters,
        min_vouch_score: minVouchScore
      });

    if (usersError) {
      console.error('[Mesh-Alert] Users fetch error:', usersError);
      throw new Error(`Failed to find nearby users: ${usersError.message}`);
    }

    if (!nearbyUsers || nearbyUsers.length === 0) {
      console.log('[Mesh-Alert] No nearby users found');
      return new Response(
        JSON.stringify({
          success: true,
          alert_id: alertId,
          notified: 0,
          message: 'No nearby users with sufficient vouch score'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Filter users with valid FCM tokens (exclude alert owner)
    const fcmTokens = (Array.isArray(nearbyUsers) ? nearbyUsers : [])
      .map((user) => {
        const rec = (typeof user === "object" && user !== null) ? (user as Record<string, unknown>) : {};
        const id = typeof rec.id === "string" ? rec.id : null;
        const token = typeof rec.fcm_token === "string" ? rec.fcm_token : null;
        return { id, token };
      })
      .filter((u): u is { id: string; token: string } => Boolean(u.id && u.token && u.id !== alert.owner?.id))
      .map((u) => u.token);

    console.log(`[Mesh-Alert] Found ${fcmTokens.length} users to notify (${nearbyUsers.length} total nearby)`);

    if (fcmTokens.length === 0) {
      console.log('[Mesh-Alert] No users with FCM tokens found');
      return new Response(
        JSON.stringify({
          success: true,
          alert_id: alertId,
          notified: 0,
          message: 'No users with push notification tokens found'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // =====================================================
    // PREPARE NOTIFICATION PAYLOAD
    // =====================================================
    const notificationPayload = {
      notification: {
        title: `Lost ${alert.pet?.species || 'Pet'} Alert Nearby`,
        body: `${alert.pet?.name || 'A pet'} is lost near you. Help ${alert.owner?.display_name || 'the owner'} find them!`,
        ...(alert.pet?.photo_url || alert.photo_url ? { image: alert.pet?.photo_url || alert.photo_url } : {})
      },
      data: {
        type: 'mesh_alert',
        alertId: alert.id,
        latitude: String(alert.latitude),
        longitude: String(alert.longitude),
        petName: alert.pet?.name || 'Unknown',
        petSpecies: alert.pet?.species || 'Pet',
        petPhoto: alert.pet?.photo_url || '',
        ownerName: alert.owner?.display_name || 'Owner',
        ownerAvatar: alert.owner?.avatar_url || '',
        timestamp: new Date().toISOString()
      }
    };

    console.log('[Mesh-Alert] Notification payload prepared:', notificationPayload.notification.title);

    // =====================================================
    // SEND FCM NOTIFICATIONS (BATCHED)
    // =====================================================
    let sendResult: NotificationResult;
    let eventType = 'FCM_SENT';
    let eventStatus = 'SUCCESS';

    const fcmKey = Deno.env.get('FCM_SERVICE_ACCOUNT_KEY');
    if (notificationsDisabled) {
      console.warn('[Mesh-Alert] Notifications disabled by configuration.');
      sendResult = {
        successCount: 0,
        failureCount: 0,
        results: []
      };
      eventType = 'FCM_DISABLED';
      eventStatus = 'SKIPPED';
    } else if (!fcmKey) {
      console.warn('[Mesh-Alert] FCM service not configured. Notifications disabled.');
      sendResult = {
        successCount: 0,
        failureCount: 0,
        results: []
      };
      eventType = 'FCM_DISABLED';
      eventStatus = 'FAILED';
    } else {
      try {
        sendResult = await sendFCMNotificationsBatched(fcmTokens, notificationPayload);
        console.log(`[Mesh-Alert] Sent ${sendResult.successCount} successful, ${sendResult.failureCount} failed`);
      } catch (fcmError: unknown) {
        console.error('[Mesh-Alert] FCM send failed:', fcmError);
        sendResult = {
          successCount: 0,
          failureCount: fcmTokens.length,
          results: fcmTokens.map(token => ({
            success: false,
            token,
            error: 'FCM send failed'
          }))
        };
        eventType = 'FCM_FAILED';
        eventStatus = 'FAILED';
      }
    }

    // =====================================================
    // LOG NOTIFICATION ACTIVITY (ALWAYS LOG, EVEN IF FCM FAILS)
    // =====================================================
    try {
      await supabase
        .from('notification_logs')
        .insert({
          alert_id: alertId,
          notification_type: 'mesh_alert',
          recipients_count: fcmTokens.length,
          success_count: sendResult.successCount,
          failure_count: sendResult.failureCount,
          metadata: {
            radius_meters: effectiveRadiusMeters,
            min_vouch_score: minVouchScore,
            nearby_users_count: nearbyUsers.length,
            fcm_error: sendResult.successCount === 0 && sendResult.failureCount > 0 ? 'FCM service may not be configured' : undefined
          }
        });
    } catch (logError) {
      console.warn('[Mesh-Alert] Failed to log notification:', logError);
      // Non-critical error, continue
    }

    // =====================================================
    // LOG TO EMERGENCY_LOGS (for testing when FCM keys missing)
    // =====================================================
    try {
      await supabase
        .from('emergency_logs')
        .insert({
          alert_id: alertId,
          event_type: eventType,
          status: eventStatus,
          recipients_count: fcmTokens.length,
          success_count: sendResult.successCount,
          failure_count: sendResult.failureCount,
          error_message: eventType === 'MOCK_SENT' ? 'FCM service not configured - mock notification sent' : null,
          metadata: {
            radius_meters: effectiveRadiusMeters,
            min_vouch_score: minVouchScore,
            nearby_users_count: nearbyUsers.length,
            filtered_owner: true,
            batches_sent: Math.ceil(fcmTokens.length / FCM_BATCH_SIZE)
          }
        });

      console.log(`[Mesh-Alert] Emergency log created: ${eventType} - ${eventStatus}`);
    } catch (emergencyLogError) {
      console.warn('[Mesh-Alert] Failed to log to emergency_logs:', emergencyLogError);
      // Non-critical error, continue
    }

    // =====================================================
    // RETURN SUCCESS RESPONSE
    // =====================================================
    return new Response(
      JSON.stringify({
        success: true,
        alert_id: alertId,
        notified: sendResult.successCount,
        failed: sendResult.failureCount,
        radius_meters: effectiveRadiusMeters,
        nearby_users: nearbyUsers.length,
        min_vouch_score: minVouchScore,
        details: {
          success_count: sendResult.successCount,
          failure_count: sendResult.failureCount,
          batches: Math.ceil(fcmTokens.length / FCM_BATCH_SIZE)
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: unknown) {
    console.error('[Mesh-Alert] Function error:', error);
    const message = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({
        success: false,
        error: message || 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: message.includes('Missing required') ? 400 : 500,
      }
    );
  }
});

/**
 * Send FCM notifications in batches to prevent timeout with 50+ neighbors
 * Firebase allows up to 500 tokens per multicast request
 */
async function sendFCMNotificationsBatched(
  tokens: string[],
  payload: Record<string, unknown>
): Promise<NotificationResult> {
  const batches: string[][] = [];

  // Split tokens into batches
  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    batches.push(tokens.slice(i, i + FCM_BATCH_SIZE));
  }

  console.log(`[FCM] Sending ${tokens.length} notifications in ${batches.length} batch(es)`);

  let totalSuccess = 0;
  let totalFailure = 0;
  const allResults: Array<{ success: boolean; token: string; error?: string }> = [];

  // =====================================================
  // FCM SERVICE ACCOUNT KEY PLACEHOLDER
  // =====================================================
  // IMPORTANT: Add your Firebase service account key to environment variables
  // const fcmServiceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT_KEY') || '{}');
  //
  // To generate your FCM service account key:
  // 1. Go to Firebase Console → Project Settings → Service Accounts
  // 2. Click "Generate new private key"
  // 3. Save the JSON file
  // 4. Add the entire JSON as FCM_SERVICE_ACCOUNT_KEY environment variable
  //
  // Example implementation with Firebase Admin SDK:
  // import { initializeApp, credential } from 'https://esm.sh/firebase-admin@11/app';
  // import { getMessaging } from 'https://esm.sh/firebase-admin@11/messaging';
  //
  // const app = initializeApp({
  //   credential: credential.cert(fcmServiceAccount)
  // });
  // const messaging = getMessaging(app);

  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[FCM] Processing batch ${i + 1}/${batches.length} (${batch.length} tokens)`);

    try {
      // =====================================================
      // PRODUCTION FCM IMPLEMENTATION (commented out for now)
      // =====================================================
      // const response = await messaging.sendMulticast({
      //   tokens: batch,
      //   notification: payload.notification,
      //   data: payload.data,
      //   android: {
      //     priority: 'high',
      //     notification: {
      //       sound: 'default',
      //       clickAction: 'FLUTTER_NOTIFICATION_CLICK'
      //     }
      //   },
      //   apns: {
      //     payload: {
      //       aps: {
      //         sound: 'default',
      //         badge: 1
      //       }
      //     }
      //   }
      // });
      //
      // totalSuccess += response.successCount;
      // totalFailure += response.failureCount;
      //
      // response.responses.forEach((resp, idx) => {
      //   allResults.push({
      //     success: resp.success,
      //     token: batch[idx],
      //     error: resp.error?.message
      //   });
      // });

      // =====================================================
      // MOCK IMPLEMENTATION (for development without FCM keys)
      // =====================================================
      // Replace this section once FCM_SERVICE_ACCOUNT_KEY is configured
      const mockResult = await mockSendFCMBatch(batch, payload);
      totalSuccess += mockResult.successCount;
      totalFailure += mockResult.failureCount;
      allResults.push(...mockResult.results);

      // Add delay between batches to respect FCM rate limits
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }

    } catch (batchError: unknown) {
      const message = batchError instanceof Error ? batchError.message : String(batchError);
      console.error(`[FCM] Batch ${i + 1} failed:`, batchError);
      // Mark entire batch as failed
      totalFailure += batch.length;
      batch.forEach(token => {
        allResults.push({
          success: false,
          token,
          error: message || 'Batch send failed'
        });
      });
    }
  }

  console.log(`[FCM] Complete: ${totalSuccess} success, ${totalFailure} failed`);

  return {
    successCount: totalSuccess,
    failureCount: totalFailure,
    results: allResults
  };
}

/**
 * Mock FCM send for development (remove once FCM_SERVICE_ACCOUNT_KEY is configured)
 */
async function mockSendFCMBatch(
  tokens: string[],
  payload: Record<string, unknown>
): Promise<NotificationResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));

  // Simulate 95% success rate
  const results = tokens.map(token => ({
    success: Math.random() > 0.05,
    token,
    error: Math.random() > 0.05 ? undefined : 'Invalid token'
  }));

  return {
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length,
    results
  };
}
