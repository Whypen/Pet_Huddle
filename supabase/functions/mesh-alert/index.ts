// Mesh-Alert Supabase Edge Function
// Notifies nearby verified users when a lost pet alert is created

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { alertId, radiusMeters = 1000, minVouchScore = 5 }: MeshAlertRequest = await req.json();

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get alert details
    const { data: alert, error: alertError } = await supabase
      .from('lost_pet_alerts')
      .select(`
        id,
        latitude,
        longitude,
        description,
        photo_url,
        owner:profiles!lost_pet_alerts_owner_id_fkey(display_name, avatar_url),
        pet:pets(name, species, photo_url)
      `)
      .eq('id', alertId)
      .single();

    if (alertError) {
      throw new Error(`Failed to fetch alert: ${alertError.message}`);
    }

    // Find nearby users with sufficient vouch score using PostgreSQL function
    const { data: nearbyUsers, error: usersError } = await supabase
      .rpc('find_nearby_users', {
        alert_lat: alert.latitude,
        alert_lng: alert.longitude,
        radius_meters: radiusMeters,
        min_vouch_score: minVouchScore
      });

    if (usersError) {
      throw new Error(`Failed to find nearby users: ${usersError.message}`);
    }

    // Filter users with FCM tokens
    const fcmTokens = nearbyUsers
      .map((user: any) => user.fcm_token)
      .filter(Boolean);

    console.log(`Found ${fcmTokens.length} nearby users to notify`);

    // In production, send FCM notifications here
    // This requires Firebase Admin SDK and Apple Developer ID
    // For MVP/demo, we'll just log the notification payload

    const notificationPayload = {
      title: `Lost ${alert.pet?.species || 'Pet'} Alert`,
      body: `${alert.pet?.name || 'A pet'} is lost nearby. Help ${alert.owner?.display_name || 'owner'} find them!`,
      data: {
        alertId: alert.id,
        latitude: alert.latitude,
        longitude: alert.longitude,
        petName: alert.pet?.name,
        petPhoto: alert.pet?.photo_url,
        ownerName: alert.owner?.display_name,
      },
      image: alert.pet?.photo_url || alert.photo_url,
    };

    console.log('Notification payload:', notificationPayload);
    console.log('Would send to tokens:', fcmTokens.length, 'users');

    // Mock notification send (replace with actual FCM in production)
    const mockSendNotifications = async (tokens: string[], payload: any) => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        successCount: tokens.length,
        failureCount: 0,
        results: tokens.map(token => ({ success: true, token }))
      };
    };

    const sendResult = await mockSendNotifications(fcmTokens, notificationPayload);

    // Log notification activity
    const { error: logError } = await supabase
      .from('notification_logs')
      .insert({
        alert_id: alertId,
        notification_type: 'mesh_alert',
        recipients_count: fcmTokens.length,
        success_count: sendResult.successCount,
        failure_count: sendResult.failureCount,
      })
      .select()
      .single();

    if (logError) {
      console.warn('Failed to log notification:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alert_id: alertId,
        notified: fcmTokens.length,
        radius_meters: radiusMeters,
        nearby_users: nearbyUsers.length,
        details: {
          success_count: sendResult.successCount,
          failure_count: sendResult.failureCount,
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Mesh-Alert function error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
