#!/usr/bin/env bash
# Registry image helpers for env-manager deploy (source after stack-utils.sh).

# Load backend/env/registry.env when present (not required for local-only builds).
deploy_load_registry_config() {
    local registry_file="${PROJECT_ROOT}/backend/env/registry.env"
    if [[ -f "$registry_file" ]]; then
        set -a
        # shellcheck source=/dev/null
        source "$registry_file"
        set +a
    fi
}

deploy_registry_enabled() {
    if [[ "${DEPLOY_FORCE_BUILD:-false}" == "true" ]]; then
        return 1
    fi
    [[ "${EMR_USE_REGISTRY:-0}" == "1" ]]
}

deploy_resolve_image_tag() {
    if [[ -n "${EMR_IMAGE_TAG:-}" ]]; then
        echo "$EMR_IMAGE_TAG"
        return 0
    fi
    if [[ -d "${PROJECT_ROOT}/.git" ]]; then
        git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null && return 0
    fi
    echo "latest"
}

deploy_registry_login() {
    local registry="${EMR_REGISTRY:-ghcr.io}"

    if [[ -n "${EMR_REGISTRY_TOKEN:-}" && -n "${EMR_REGISTRY_USER:-}" ]]; then
        ui_step "Logging in to ${registry}"
        if echo "$EMR_REGISTRY_TOKEN" | docker login "$registry" -u "$EMR_REGISTRY_USER" --password-stdin 2>/dev/null; then
            ui_success "Logged in to ${registry} as ${EMR_REGISTRY_USER}"
            return 0
        else
            ui_error "Login failed for ${registry} as ${EMR_REGISTRY_USER}"
            return 1
        fi
    fi

    if [[ -n "${GITHUB_TOKEN:-}" && -n "${GITHUB_ACTOR:-}" ]]; then
        ui_step "Logging in to ${registry} (CI token)"
        if echo "$GITHUB_TOKEN" | docker login "$registry" -u "$GITHUB_ACTOR" --password-stdin 2>/dev/null; then
            ui_success "Logged in to ${registry} as ${GITHUB_ACTOR}"
            return 0
        else
            ui_error "Login failed for ${registry} as ${GITHUB_ACTOR}"
            return 1
        fi
    fi

    # No explicit credentials — try existing Docker config
    ui_info "Attempting login with existing Docker credentials for ${registry}"
    if docker login "$registry" --username "" 2>/dev/null; then
        return 0
    fi

    ui_warning "No credentials available for ${registry} — will fall back to local build"
    return 1
}

deploy_validate_registry_access() {
    local registry="${EMR_REGISTRY:-ghcr.io}"
    local backend_image="${EMR_BACKEND_IMAGE:-ghcr.io/ussyboy7/emr-backend}"
    local frontend_image="${EMR_FRONTEND_IMAGE:-ghcr.io/ussyboy7/emr-frontend-stag}"
    local tag="${EMR_IMAGE_TAG:-latest}"

    ui_step "Validating registry access for ${tag}"

    # Quick check: can we pull the backend manifest?
    if docker manifest inspect "${backend_image}:${tag}" >/dev/null 2>&1; then
        ui_success "Registry access OK — ${backend_image}:${tag}"
        return 0
    fi

    ui_error "Cannot access ${backend_image}:${tag} from registry"
    ui_info "Possible causes:"
    ui_info "  1. GHCR credentials not configured (set GITHUB_TOKEN + GITHUB_ACTOR, or EMR_REGISTRY_TOKEN + EMR_REGISTRY_USER)"
    ui_info "  2. Image not yet pushed by CI (check: ghcr.io/ussyboy7/emr-backend:${tag})"
    ui_info "  3. Registry package visibility restrictions"
    ui_info "Falling back to local build…"
    return 1
}
