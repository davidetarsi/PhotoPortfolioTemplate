variable "account_id" {
  type        = string
  description = "ID dell'account Cloudflare. Dashboard → barra laterale destra."
}

variable "project_name" {
  type        = string
  description = "Prefisso di bucket e Worker, es. 'mario-portfolio'. Minuscole e trattini."

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Solo minuscole, cifre e trattini."
  }
}

variable "prod_hostname" {
  type        = string
  description = "Hostname pubblico di produzione, es. 'mario.com' oppure 'mario-portfolio.xxx.workers.dev'."
}

variable "staging_hostname" {
  type        = string
  default     = ""
  description = "Staging hostname without a scheme. Required only when enable_staging is true."
}

variable "enable_staging" {
  type        = bool
  default     = false
  description = "Create the second environment (bucket, managed domain, Access application)."
}

variable "admin_emails" {
  type        = list(string)
  description = "Email autorizzate alla dashboard admin."

  validation {
    condition     = length(var.admin_emails) > 0
    error_message = "Serve almeno un'email, altrimenti nessuno puo entrare nella dashboard."
  }
}

# Non e creato da Terraform: e il team Zero Trust dell'account, che esiste
# gia. Entra qui come variabile perche il Worker deve riceverlo in
# wrangler.json per validare i JWT di Access.
variable "access_team_domain" {
  type        = string
  description = "Team domain Zero Trust, senza https://, es. 'mario.cloudflareaccess.com'."

  validation {
    condition     = can(regex("^[a-z0-9-]+\\.cloudflareaccess\\.com$", var.access_team_domain))
    error_message = "Formato atteso: <team>.cloudflareaccess.com, senza schema."
  }
}

variable "custom_photo_domain" {
  type        = string
  default     = ""
  description = "Dominio custom per le foto, es. 'img.mario.com'. Vuoto = si usa r2.dev, che Cloudflare dichiara rate-limited e solo per sviluppo. Serve anche photo_domain_zone_id."
}

variable "photo_domain_zone_id" {
  type        = string
  default     = ""
  description = "Zone ID del dominio custom delle foto. Obbligatorio se custom_photo_domain e valorizzato."
}

variable "keep_managed_domain" {
  type        = bool
  default     = true
  description = "Tiene acceso il dominio r2.dev di produzione. Va messo a false SOLO dopo aver verificato che il dominio custom serve le foto: spegnerlo prima lascia il sito senza immagini."
}

variable "enable_turnstile" {
  type        = bool
  default     = true
  description = "Crea il widget Turnstile che protegge il form di contatto. A false il form resta protetto solo dall'honeypot."
}
