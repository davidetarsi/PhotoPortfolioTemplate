resource "cloudflare_r2_bucket" "prod" {
  account_id = var.account_id
  name       = var.project_name
}

resource "cloudflare_r2_bucket" "staging" {
  count      = var.enable_staging ? 1 : 0
  account_id = var.account_id
  name       = "${var.project_name}-staging"
}

# Espone i bucket sul dominio gestito r2.dev. Rate-limited e senza cache:
# per la produzione vera si valorizza custom_photo_domain (vedi sotto).
resource "cloudflare_r2_managed_domain" "prod" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.prod.name

  # Resta acceso finche' non si e' verificato che il dominio custom serve
  # davvero le foto. Lo staging non ha un custom, quindi il suo resta sempre acceso.
  enabled = var.keep_managed_domain || var.custom_photo_domain == ""
}

resource "cloudflare_r2_managed_domain" "staging" {
  count       = var.enable_staging ? 1 : 0
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.staging[0].name
  enabled     = true
}

# Opzionale: dominio custom sulle foto di produzione. Da'
# cache, WAF e controlli d'accesso, che r2.dev non ha.
resource "cloudflare_r2_custom_domain" "prod" {
  count = var.custom_photo_domain == "" ? 0 : 1

  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.prod.name
  domain      = var.custom_photo_domain
  zone_id     = var.photo_domain_zone_id
  enabled     = true
}

# Messaggi del form di contatto: bucket privato, senza dominio r2.dev né custom.
# Solo il Worker li legge, tramite il binding MESSAGES_BUCKET.
resource "cloudflare_r2_bucket" "messages_prod" {
  account_id = var.account_id
  name       = "${var.project_name}-messages"
}

resource "cloudflare_r2_bucket" "messages_staging" {
  count      = var.enable_staging ? 1 : 0
  account_id = var.account_id
  name       = "${var.project_name}-messages-staging"
}
