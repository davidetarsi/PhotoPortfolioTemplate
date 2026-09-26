output "project_name" {
  value = var.project_name
}

output "bucket_prod" {
  value = cloudflare_r2_bucket.prod.name
}

output "bucket_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.staging[0].name : ""
}

# Bucket privati dei messaggi: solo il nome, per il binding del Worker. Nessun URL pubblico.
output "messages_bucket_prod" {
  value = cloudflare_r2_bucket.messages_prod.name
}

output "messages_bucket_staging" {
  value = var.enable_staging ? cloudflare_r2_bucket.messages_staging[0].name : ""
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

# Solo la sitekey: e' pubblica e finisce nell'HTML. Il secret NON e' un
# output — va messo a mano con `wrangler secret put TURNSTILE_SECRET`,
# perche' outputs.json viene letto da uno script e non deve contenere
# credenziali.
output "turnstile_sitekey" {
  value = var.enable_turnstile ? cloudflare_turnstile_widget.contact[0].sitekey : ""
}
