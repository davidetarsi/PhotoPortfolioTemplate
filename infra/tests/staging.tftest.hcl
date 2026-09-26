mock_provider "cloudflare" {
  mock_resource "cloudflare_r2_managed_domain" {
    defaults = {
      domain = "pub-mock.r2.dev"
    }
  }

  mock_resource "cloudflare_zero_trust_access_application" {
    defaults = {
      aud = "mock-access-aud"
    }
  }

  mock_resource "cloudflare_turnstile_widget" {
    defaults = {
      sitekey = "mock-turnstile-sitekey"
    }
  }
}

variables {
  account_id         = "0123456789abcdef0123456789abcdef"
  project_name       = "test-portfolio"
  access_team_domain = "test.cloudflareaccess.com"
  prod_hostname      = "portfolio.example.com"
  admin_emails       = ["admin@example.com"]
  enable_turnstile   = false
}

run "staging_disabled_by_default" {
  command = plan

  assert {
    condition     = length(cloudflare_r2_bucket.staging) == 0
    error_message = "The staging R2 bucket must not exist by default."
  }

  assert {
    condition     = length(cloudflare_r2_managed_domain.staging) == 0
    error_message = "The staging managed domain must not exist by default."
  }

  assert {
    condition     = length(cloudflare_zero_trust_access_application.staging) == 0
    error_message = "The staging Access application must not exist by default."
  }

  assert {
    condition = (
      output.bucket_staging == "" &&
      output.r2_public_url_staging == "" &&
      output.access_aud_staging == ""
    )
    error_message = "All staging outputs must be empty when staging is disabled."
  }

  assert {
    condition     = output.messages_bucket_prod == "test-portfolio-messages" && output.messages_bucket_staging == ""
    error_message = "Production must have a private message bucket; staging must have none by default."
  }

  assert {
    condition     = length(cloudflare_r2_bucket.messages_staging) == 0
    error_message = "The staging message bucket must not exist by default."
  }

  assert {
    condition     = cloudflare_r2_managed_domain.prod.bucket_name == "test-portfolio"
    error_message = "Only the photo bucket may be public: the managed domain must stay on it."
  }

  assert {
    condition     = output.prod_hostname == "portfolio.example.com"
    error_message = "The production hostname must be an output, for the Worker route in wrangler.json."
  }
}

run "staging_enabled_explicitly" {
  command = plan

  variables {
    enable_staging   = true
    staging_hostname = "portfolio-staging.example.workers.dev"
  }

  assert {
    condition = (
      length(cloudflare_r2_bucket.staging) == 1 &&
      length(cloudflare_r2_managed_domain.staging) == 1 &&
      length(cloudflare_zero_trust_access_application.staging) == 1
    )
    error_message = "Explicit staging must create exactly one instance of every staging resource."
  }

  assert {
    condition     = output.bucket_staging == "test-portfolio-staging"
    error_message = "The enabled staging bucket output must use the project suffix."
  }

  assert {
    condition     = output.messages_bucket_staging == "test-portfolio-messages-staging"
    error_message = "Enabled staging must have its own private message bucket."
  }
}
