import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildKeywordReplyMessages } from "@/prompts/keywordReply";
import { scanSensitive } from "@/lib/interactionCompliance";
import { scanCompliance, mergeRisk } from "@/lib/compliance";
import { normalizeKeyword, commentMatchesKeyword, CAMPAIGN_STATUSES } from "@/lib/keywordTypes";
import { createLead, LeadError } from "@/services/leadService";

export class KeywordError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const RISK_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };

async function loadOwnedCampaign(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("keyword_campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new KeywordError("Campaign not found", 404);
  if (data.owner_id !== userId) throw new KeywordError("Forbidden", 403);
  return data;
}

async function loadOwnedMatch(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("keyword_matches")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new KeywordError("Keyword match not found", 404);
  if (data.owner_id !== userId) throw new KeywordError("Forbidden", 403);
  return data;
}

async function assertBrandOwned(brandId: string, userId: string) {
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("owner_id, name, compliance_notes")
    .eq("id", brandId)
    .single();
  if (!brand || brand.owner_id !== userId) throw new KeywordError("Forbidden", 403);
  return brand;
}

// ---------------- Campaigns ----------------

export async function listCampaigns(userId: string, brandId?: string) {
  let q = supabaseAdmin.from("keyword_campaigns").select("*").eq("owner_id", userId);
  if (brandId) q = q.eq("brand_id", brandId);
  const { data } = await q.order("created_at", { ascending: false });
  return data ?? [];
}

export async function createCampaign(input: Record<string, unknown>, userId: string) {
  const brandId = String(input.brand_id || "");
  if (!brandId) throw new KeywordError("brand_id is required", 400);
  await assertBrandOwned(brandId, userId);

  const name = String(input.name || "").trim();
  if (!name) throw new KeywordError("Campaign name is required", 400);

  const platform = String(input.platform || "");
  if (!["facebook", "instagram", "tiktok"].includes(platform))
    throw new KeywordError("Invalid platform", 400);

  const keyword = normalizeKeyword(String(input.keyword || ""));
  if (!keyword) throw new KeywordError("Keyword is required", 400);

  const status = input.status ? String(input.status) : "draft";
  if (!CAMPAIGN_STATUSES.includes(status as never)) throw new KeywordError("Invalid status", 400);

  // duplicate guard for ACTIVE campaigns (matches the partial unique index)
  if (status === "active") {
    const { data: clash } = await supabaseAdmin
      .from("keyword_campaigns")
      .select("id")
      .eq("owner_id", userId)
      .eq("brand_id", brandId)
      .eq("platform", platform)
      .eq("status", "active")
      .ilike("keyword", keyword)
      .maybeSingle();
    if (clash)
      throw new KeywordError(`An active "${keyword}" campaign already exists on ${platform}.`, 409);
  }

  const row = {
    owner_id: userId,
    brand_id: brandId,
    related_post_id: (input.related_post_id as string) || null,
    name,
    platform,
    keyword,
    offer_name: (input.offer_name as string) || null,
    lead_category: (input.lead_category as string) || null,
    related_post_url: (input.related_post_url as string) || null,
    public_reply_template: (input.public_reply_template as string) || null,
    dm_template: (input.dm_template as string) || null,
    follow_up_template: (input.follow_up_template as string) || null,
    status,
    start_date: (input.start_date as string) || null,
    end_date: (input.end_date as string) || null,
  };

  const { data, error } = await supabaseAdmin
    .from("keyword_campaigns")
    .insert(row)
    .select()
    .single();
  if (error) {
    if (error.code === "23505")
      throw new KeywordError(`An active "${keyword}" campaign already exists on ${platform}.`, 409);
    throw new KeywordError(`Could not create campaign: ${error.message}`, 500);
  }
  return data;
}

export async function updateCampaign(id: string, input: Record<string, unknown>, userId: string) {
  await loadOwnedCampaign(id, userId);
  const editable = [
    "name", "platform", "keyword", "offer_name", "lead_category", "related_post_id",
    "related_post_url", "public_reply_template", "dm_template", "follow_up_template",
    "start_date", "end_date",
  ];
  const update: Record<string, unknown> = {};
  for (const k of editable) if (input[k] !== undefined) update[k] = input[k];
  if (update.keyword !== undefined) {
    update.keyword = normalizeKeyword(String(update.keyword));
    if (!update.keyword) throw new KeywordError("Keyword cannot be empty", 400);
  }
  if (update.platform !== undefined && !["facebook", "instagram", "tiktok"].includes(String(update.platform)))
    throw new KeywordError("Invalid platform", 400);
  if (Object.keys(update).length === 0) throw new KeywordError("No editable fields provided", 400);

  const { data, error } = await supabaseAdmin
    .from("keyword_campaigns")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new KeywordError(`Could not update campaign: ${error.message}`, 500);
  return data;
}

export async function setCampaignStatus(id: string, status: string, userId: string) {
  const campaign = await loadOwnedCampaign(id, userId);
  if (!CAMPAIGN_STATUSES.includes(status as never)) throw new KeywordError("Invalid status", 400);

  if (status === "active") {
    const { data: clash } = await supabaseAdmin
      .from("keyword_campaigns")
      .select("id")
      .eq("owner_id", userId)
      .eq("brand_id", campaign.brand_id)
      .eq("platform", campaign.platform)
      .eq("status", "active")
      .ilike("keyword", campaign.keyword)
      .neq("id", id)
      .maybeSingle();
    if (clash)
      throw new KeywordError(
        `Another active "${campaign.keyword}" campaign already exists on ${campaign.platform}.`,
        409
      );
  }

  const { data, error } = await supabaseAdmin
    .from("keyword_campaigns")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505")
      throw new KeywordError("An active campaign with this keyword already exists.", 409);
    throw new KeywordError(`Could not change status: ${error.message}`, 500);
  }
  return data;
}

// ---------------- Detection ----------------

/** Find the single active campaign for this brand+platform whose keyword the comment contains. */
export async function detectCampaign(brandId: string, platform: string, comment: string, userId: string) {
  const { data: campaigns } = await supabaseAdmin
    .from("keyword_campaigns")
    .select("*")
    .eq("owner_id", userId)
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .eq("status", "active");
  const hit = (campaigns ?? []).find((c) => commentMatchesKeyword(comment, c.keyword as string));
  return hit ?? null;
}

// ---------------- Matches ----------------

export async function listMatches(userId: string, campaignId?: string) {
  let q = supabaseAdmin.from("keyword_matches").select("*").eq("owner_id", userId);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data } = await q.order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Generate (or regenerate) AI drafts for a match, run the deterministic
 * compliance scan, and save. Requires an active Brand Brain.
 */
export async function generateMatchReply(matchId: string, userId: string) {
  const match = await loadOwnedMatch(matchId, userId);
  const campaign = await loadOwnedCampaign(match.campaign_id as string, userId);

  const brand = await assertBrandOwned(campaign.brand_id as string, userId);

  const { data: brief } = await supabaseAdmin
    .from("brand_briefs")
    .select("system_context")
    .eq("brand_id", campaign.brand_id)
    .eq("status", "active")
    .maybeSingle();
  if (!brief || !brief.system_context) {
    throw new KeywordError(
      "No active Brand Brain found. Activate a brief in the Content Brain first.",
      409
    );
  }

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: buildKeywordReplyMessages({
        systemContext: brief.system_context as string,
        brandName: (brand.name as string) ?? "the brand",
        complianceNotes: (brand.compliance_notes as string) ?? null,
        platform: match.platform as string,
        keyword: match.matched_keyword as string,
        offerName: campaign.offer_name as string,
        leadCategory: campaign.lead_category as string,
        comment: match.comment_text as string,
        personName: match.person_name as string,
      }),
      response_format: { type: "json_object" },
      temperature: 0.6,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new KeywordError(`Reply generation failed: ${msg}`, 502);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    throw new KeywordError("Model returned invalid JSON. Try again.", 502);
  }

  const publicReply = (parsed.public_reply as string) ?? "";
  const dm = (parsed.dm_reply as string) ?? "";
  const followUp = (parsed.follow_up_question as string) ?? "";

  // deterministic compliance: inbound comment + outbound drafts
  const inbound = scanSensitive(match.comment_text as string);
  const draftScan = scanCompliance([publicReply, dm, followUp].filter(Boolean).join("\n"));
  const aiRisk = ["low", "medium", "high"].includes(parsed.compliance_risk as string)
    ? (parsed.compliance_risk as string)
    : "low";
  const merged = mergeRisk(aiRisk as never, draftScan);
  let risk = merged.risk as string;
  if (inbound.forceApproval && RISK_ORDER[risk] < RISK_ORDER.high) risk = "high";
  const humanApproval =
    merged.humanApprovalRequired || inbound.forceApproval || !!parsed.human_approval_required;

  const matchedLabels = [...new Set([...merged.matched, ...inbound.matched])];
  const riskReason = [parsed.risk_reason as string]
    .filter(Boolean)
    .concat(matchedLabels.length ? [`Auto-flagged: ${matchedLabels.join(", ")}.`] : [])
    .join(" ");

  const { data, error } = await supabaseAdmin
    .from("keyword_matches")
    .update({
      public_reply_draft: publicReply,
      dm_draft: dm,
      follow_up_draft: followUp,
      suggested_cta: (parsed.suggested_cta as string) ?? null,
      suggested_lead_category:
        (parsed.suggested_lead_category as string) || (campaign.lead_category as string) || null,
      compliance_risk: risk,
      human_approval_required: humanApproval,
      risk_reason: riskReason || null,
      model: OPENAI_MODEL,
      raw_ai: parsed,
      status: match.status === "new" ? "reply_drafted" : match.status,
    })
    .eq("id", matchId)
    .select()
    .single();
  if (error) throw new KeywordError(`Could not save reply: ${error.message}`, 500);

  // keep the linked interaction's drafts in sync so the Inbox shows them too
  if (match.interaction_id) {
    await supabaseAdmin
      .from("social_interactions")
      .update({
        reply_drafts: {
          public_reply: publicReply,
          dm_reply: dm,
          follow_up_question: followUp,
          booking_cta: (parsed.suggested_cta as string) ?? "",
          disclaimer: "",
        },
        compliance_risk: risk,
        human_approval_required: humanApproval,
        risk_reason: riskReason || null,
        status: "reply_drafted",
      })
      .eq("id", match.interaction_id);
  }

  return data;
}

/**
 * Save a manually-entered keyword comment: resolves the campaign (explicit or
 * auto-detected), creates a reusable social_interactions row + a keyword_matches
 * row, then attempts to generate AI drafts. Drafts failures (incl. missing Brand
 * Brain) are returned as a warning — the match itself is never lost.
 */
export async function addManualMatch(input: Record<string, unknown>, userId: string) {
  const platform = String(input.platform || "");
  if (!["facebook", "instagram", "tiktok"].includes(platform))
    throw new KeywordError("Invalid platform", 400);

  const comment = String(input.comment_text || "").trim();
  if (!comment) throw new KeywordError("Comment text is required", 400);

  // resolve campaign
  let campaign;
  if (input.campaign_id) {
    campaign = await loadOwnedCampaign(String(input.campaign_id), userId);
    if (campaign.platform !== platform)
      throw new KeywordError("Comment platform does not match the campaign platform.", 400);
  } else {
    const brandId = String(input.brand_id || "");
    if (!brandId) throw new KeywordError("brand_id is required for auto-detect", 400);
    await assertBrandOwned(brandId, userId);
    campaign = await detectCampaign(brandId, platform, comment, userId);
    if (!campaign)
      throw new KeywordError("No active campaign keyword was found in this comment.", 404);
  }

  if (campaign.status !== "active")
    throw new KeywordError(`Campaign is ${campaign.status}; only active campaigns capture matches.`, 422);

  // dedupe: same campaign + same comment + same person
  const { data: dup } = await supabaseAdmin
    .from("keyword_matches")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("comment_text", comment)
    .eq("person_name", (input.person_name as string) || "")
    .maybeSingle();
  if (dup) throw new KeywordError("This comment is already matched to the campaign.", 409);

  const personName = (input.person_name as string) || null;
  const profileUrl = (input.profile_url as string) || null;
  const relatedPostUrl = (input.related_post_url as string) || (campaign.related_post_url as string) || null;

  // 1) reusable social_interactions row (also surfaces in the Inbox)
  const { data: interaction, error: iErr } = await supabaseAdmin
    .from("social_interactions")
    .insert({
      owner_id: userId,
      brand_id: campaign.brand_id,
      related_post_id: campaign.related_post_id,
      platform,
      interaction_type: "public_comment",
      person_name: personName,
      profile_url: profileUrl,
      original_message: comment,
      status: "new",
      is_lead_candidate: true,
      suggested_lead_category: campaign.lead_category,
      notes: `Keyword campaign: ${campaign.name} (${campaign.keyword})`,
    })
    .select()
    .single();
  if (iErr) throw new KeywordError(`Could not save interaction: ${iErr.message}`, 500);

  // 2) keyword_matches row
  const { data: match, error: mErr } = await supabaseAdmin
    .from("keyword_matches")
    .insert({
      owner_id: userId,
      campaign_id: campaign.id,
      interaction_id: interaction.id,
      matched_keyword: normalizeKeyword(campaign.keyword as string),
      comment_text: comment,
      person_name: personName,
      profile_url: profileUrl,
      platform,
      related_post_url: relatedPostUrl,
      suggested_lead_category: campaign.lead_category,
      status: "new",
    })
    .select()
    .single();
  if (mErr) throw new KeywordError(`Could not save match: ${mErr.message}`, 500);

  // 3) attempt AI drafts — never lose the match if this fails
  let warning: string | null = null;
  let finalMatch = match;
  try {
    finalMatch = await generateMatchReply(match.id, userId);
  } catch (e) {
    warning = e instanceof KeywordError ? e.message : "Draft generation failed; you can retry.";
    // still run the deterministic inbound scan so risk isn't left blank
    const inbound = scanSensitive(comment);
    if (inbound.forceApproval) {
      const { data: updated } = await supabaseAdmin
        .from("keyword_matches")
        .update({
          compliance_risk: "high",
          human_approval_required: true,
          risk_reason: `Auto-flagged: ${inbound.matched.join(", ")}.`,
        })
        .eq("id", match.id)
        .select()
        .single();
      if (updated) finalMatch = updated;
    }
  }

  return { match: finalMatch, interaction, campaign, warning };
}

export async function markMatch(
  matchId: string,
  fields: { public_reply_sent?: boolean; dm_sent?: boolean; status?: string },
  userId: string
) {
  await loadOwnedMatch(matchId, userId);
  const update: Record<string, unknown> = {};
  if (typeof fields.public_reply_sent === "boolean") update.public_reply_sent = fields.public_reply_sent;
  if (typeof fields.dm_sent === "boolean") update.dm_sent = fields.dm_sent;
  if (fields.status) {
    if (!["new", "reply_drafted", "lead_created", "done", "ignored"].includes(fields.status))
      throw new KeywordError("Invalid match status", 400);
    update.status = fields.status;
  }
  if (Object.keys(update).length === 0) throw new KeywordError("Nothing to update", 400);
  const { data, error } = await supabaseAdmin
    .from("keyword_matches")
    .update(update)
    .eq("id", matchId)
    .select()
    .single();
  if (error) throw new KeywordError(`Could not update match: ${error.message}`, 500);
  return data;
}

/** Create a lead from a keyword match, prefilled, via the existing leadService. */
export async function createLeadFromMatch(matchId: string, userId: string) {
  const match = await loadOwnedMatch(matchId, userId);
  if (match.lead_id) throw new KeywordError("A lead was already created from this match.", 409);
  const campaign = await loadOwnedCampaign(match.campaign_id as string, userId);

  let lead;
  try {
    lead = await createLead(
      {
        brand_id: campaign.brand_id as string,
        source_interaction_id: (match.interaction_id as string) || null,
        source_post_id: (campaign.related_post_id as string) || null,
        name: match.person_name as string,
        platform: match.platform as string,
        profile_url: match.profile_url as string,
        lead_category:
          (match.suggested_lead_category as string) || (campaign.lead_category as string) || "General Inquiry",
        original_message: match.comment_text as string,
        intent_summary: `Commented "${match.matched_keyword}" on ${campaign.name} (${campaign.offer_name || "offer"}).`,
        notes: match.dm_draft ? `Suggested DM:\n${match.dm_draft}` : null,
      },
      userId
    );
  } catch (e) {
    if (e instanceof LeadError) throw new KeywordError(e.message, e.status);
    throw e;
  }

  await supabaseAdmin
    .from("keyword_matches")
    .update({ lead_id: lead.id, status: "lead_created" })
    .eq("id", matchId);

  return lead;
}

// ---------------- Analytics ----------------

export async function getCampaignAnalytics(campaignId: string, userId: string) {
  await loadOwnedCampaign(campaignId, userId);
  const { data: matches } = await supabaseAdmin
    .from("keyword_matches")
    .select("id, public_reply_draft, dm_draft, public_reply_sent, dm_sent, lead_id")
    .eq("owner_id", userId)
    .eq("campaign_id", campaignId);

  const rows = matches ?? [];
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];

  let qualified = 0, booked = 0, converted = 0;
  if (leadIds.length) {
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("lead_status")
      .in("id", leadIds);
    for (const l of leads ?? []) {
      if (l.lead_status === "qualified") qualified++;
      else if (l.lead_status === "booked_call") booked++;
      else if (l.lead_status === "converted") converted++;
    }
  }

  return {
    comments_matched: rows.length,
    reply_drafts_created: rows.filter((r) => (r.public_reply_draft as string)?.trim()).length,
    dm_drafts_created: rows.filter((r) => (r.dm_draft as string)?.trim()).length,
    replies_sent: rows.filter((r) => r.public_reply_sent).length,
    dms_sent: rows.filter((r) => r.dm_sent).length,
    leads_created: leadIds.length,
    qualified_leads: qualified,
    booked_calls: booked,
    converted_clients: converted,
  };
}

export async function getCampaign(id: string, userId: string) {
  const campaign = await loadOwnedCampaign(id, userId);
  const matches = await listMatches(userId, id);
  const analytics = await getCampaignAnalytics(id, userId);
  return { campaign, matches, analytics };
}

/** Optional roll-up across all campaigns for the Analytics page. */
export async function getKeywordSummary(userId: string) {
  const campaigns = await listCampaigns(userId);
  const out = [];
  for (const c of campaigns) {
    const a = await getCampaignAnalytics(c.id as string, userId);
    out.push({ id: c.id, name: c.name, keyword: c.keyword, platform: c.platform, status: c.status, ...a });
  }
  return out;
}
