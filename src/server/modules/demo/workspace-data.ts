import { createDatabase } from "../../db/client";

export async function readWorkspaceData() {
  const { client } = createDatabase(process.env.DATABASE_URL ?? "");
  try {
    const [summary] = await client<{
      order_count: number; case_count: number; open_obligation_minor: number;
      captured_minor: number; refunded_minor: number; verified_actions: number;
    }[]>`select
      (select count(*)::int from orders) as order_count,
      (select count(*)::int from cases) as case_count,
      (select coalesce(sum(greatest(0, ob.entitled_minor - coalesce(a.allocated, 0))), 0)::int from obligations ob
        left join lateral (select sum(amount_minor)::int as allocated from obligation_allocations where obligation_id = ob.id and state = 'COMPLETED') a on true) as open_obligation_minor,
      (select coalesce(sum(captured_minor), 0)::int from captures where status = 'COMPLETED') as captured_minor,
      (select coalesce(sum(amount_minor), 0)::int from refunds where status = 'COMPLETED') as refunded_minor,
      (select count(*)::int from actions where state = 'VERIFIED_CLOSED') as verified_actions`;
    const cases = await client<{ external_ref: string; kind: string; status: string; severity: string; source_tier: string; order_ref: string; updated_at: Date | string }[]>`
      select cs.external_ref, cs.kind, cs.status, cs.severity, cs.source_tier, o.external_ref as order_ref, cs.updated_at
      from cases cs join orders o on o.id = cs.order_id order by cs.updated_at desc, cs.external_ref`;
    const orders = await client<{ id: string; external_ref: string; fixture_key: string | null; total_minor: number; status: string; item_count: number; capture_status: string | null }[]>`
      select o.id, o.external_ref, o.fixture_key, o.total_minor, o.status,
        (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count,
        (select max(c.status) from captures c where c.order_id = o.id) as capture_status
      from orders o order by o.created_at desc`;
    const actions = await client<{ id: string; case_ref: string; state: string; amount_minor: number; approved_at: Date | string; verified_at: Date | string | null; provider_resource_id: string | null }[]>`
      select a.id, cs.external_ref as case_ref, a.state, p.amount_minor, a.approved_at, a.verified_at, a.provider_resource_id
      from actions a join proposals p on p.id = a.proposal_id join cases cs on cs.id = p.case_id
      order by a.created_at desc`;
    return { summary: summary!, cases, orders, actions };
  } finally {
    await client.end();
  }
}
