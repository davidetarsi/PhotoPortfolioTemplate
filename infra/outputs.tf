output "project_name" {
  value = var.project_name
}

# Il dominio di produzione: infra:sync lo scrive in wrangler.json come custom domain
# del Worker, cosi il deploy lo collega da solo.
output "prod_hostname" {
  value = var.prod_hostname
}

output "bucket_prod" {
  value = cloudflare_r2_bucket.prod.name
}

output "bucket_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.staging[0].name : ""
}

# Bucket privati (messaggi, bozza, foto in attesa): solo il nome, per il binding del Worker. Nessun URL pubblico.
output "private_bucket_prod" {
  value = cloudflare_r2_bucket.private_prod.name
}

output "private_bucket_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.private_staging[0].name : ""
}

# Se e stato configurato un dominio custom vince quello: e l'unico
# adatto alla produzione. Altrimenti si ripiega su r2.dev.
output "r2_public_url_prod" {
  value = var.custom_photo_domain != "" ? "https://${var.custom_photo_domain}" : "https://${cloudflare_r2_managed_domain.prod.domain}"
}

output "r2_public_url_staging" {
  value = var.enable_staging ? "https://${cloudflare_r2_managed_domain.staging[0].domain}" : ""
}

output "access_aud_prod" {
  value = cloudflare_zero_trust_access_application.prod.aud
}

output "access_aud_staging" {
  value = var.enable_staging ? cloudflare_zero_trust_access_application.staging[0].aud : ""
}

# Non nasce da una risorsa: rimanda alla variabile omonima. Sta qui
# perche gen-wrangler.js legge un unico file di output, e spezzare la
# sorgente in due significherebbe tenerne allineate due.
output "access_team_domain" {
  value = var.access_team_domain
}

# La sitekey e' pubblica e finisce nell'HTML.
output "turnstile_sitekey" {
  value = var.enable_turnstile ? cloudflare_turnstile_widget.contact[0].sitekey : ""
}

# Il secret e' sensibile: `npm run setup:secrets` lo passa al Worker con una pipe,
# senza scriverlo su file. `terraform output -json` lo stampa in chiaro, per questo
# `npm run setup` e `npm run infra:sync` scartano gli output sensibili prima di
# scrivere qualsiasi file. Lo stato di Terraform lo contiene comunque: resta locale.
output "turnstile_secret" {
  value     = var.enable_turnstile ? cloudflare_turnstile_widget.contact[0].secret : ""
  sensitive = true
}
