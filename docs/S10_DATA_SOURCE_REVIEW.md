# S10 external-data hypothesis review

Reviewed 9 November 2026. No real-person risk data was ingested, matched, redistributed or sent to the model.

Candidate: US Treasury OFAC Sanctions List Service, an official free source with downloadable designation lists: https://ofac.treasury.gov/sanctions-list-service . This is a sanctions designation dataset, not an ecommerce fraud-conviction register. It does not establish that an order claimant committed fraud. OFAC's own match guidance warns that potential matches can be false positives and requires examining identifiers: https://ofac.treasury.gov/faqs/topic/1591 .

| Gate | Finding |
|---|---|
| Supplier identity | Verified official US Treasury source. |
| Free access | Official download service available; no paid source authorized. |
| License/redistribution and permitted purpose | Not verified for this public ecommerce demo. No ingestion. |
| Merchant relevance | Sanctions screening is a different purpose from resolving item condition, delivery or prior refund evidence. No demonstrated value for the selected merchant task. |
| Jurisdiction/privacy/legal basis | Unverified; no real customer consent or risk-data legal review. |
| Correction/update process | Official source exists; application update/correction obligations not evaluated sufficiently to pass. |
| Representative match quality/false positives | No representative ecommerce evaluation; no accuracy claim. |

Decision: suitability gate does not pass. Use a fictional, explicitly synthetic entity-resolution lead only. The example illustrates how a shared name plus conflicting identifiers remains unconfirmed, requires independent human verification, and never changes financial entitlement or becomes a fraud accusation. No allegation about a real person appears. Before future real-data use, verify every gate and conduct legal/privacy review under a separately authorized real-customer release contract.

PayPal dispute gate: sandbox OAuth returned HTTP 200; GET `/v1/customer/disputes?page_size=1` returned HTTP 200 with zero items. Read access is observed, but no actual dispute record, deadline or evidence payload is available. The dispute inquiry remains a synthetic preparation scenario. No dispute creation, response, message or submission was attempted.
