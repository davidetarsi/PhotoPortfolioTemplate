resource "cloudflare_zero_trust_access_policy" "solo_admin" {
  account_id = var.account_id
  name       = "${var.project_name} — admin"
  decision   = "allow"

  # Una voce include per ogni email autorizzata. Prendere solo
  # admin_emails[0] farebbe sparire in silenzio gli altri indirizzi,
  # lasciando fuori dalla dashboard persone che la configurazione
  # dichiara ammesse.
  include = [for e in var.admin_emails : { email = { email = e } }]
}

# Produzione: zona reale, quindi Access si limita ai due percorsi admin
# e lascia pubblico tutto il resto del sito.
resource "cloudflare_zero_trust_access_application" "prod" {
  account_id       = var.account_id
  name             = "${var.project_name} admin (prod)"
  type             = "self_hosted"
  session_duration = "24h"

  destinations = [
    { type = "public", uri = "${var.prod_hostname}/admin" },
    { type = "public", uri = "${var.prod_hostname}/api/admin" },
  ]

  policies = [{
    id         = cloudflare_zero_trust_access_policy.solo_admin.id
    precedence = 1
  }]
}

# Staging: dominio workers.dev, dove Access non sa fare path-scoping.
# Protegge tutto, ed e accettabile perche staging non ha pubblico.
resource "cloudflare_zero_trust_access_application" "staging" {
  count            = var.enable_staging ? 1 : 0
  account_id       = var.account_id
  name             = "${var.project_name} admin (staging)"
  type             = "self_hosted"
  session_duration = "24h"

  destinations = [
    { type = "public", uri = var.staging_hostname },
  ]

  policies = [{
    id         = cloudflare_zero_trust_access_policy.solo_admin.id
    precedence = 1
  }]
}
