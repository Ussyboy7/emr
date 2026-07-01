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
        echo "$EMR_REGISTRY_TOKEN" | docker login "$registry" -u "$EMR_REGISTRY_USER" --password-stdin
        return 0
    fi

    if [[ -n "${GITHUB_TOKEN:-}" && -n "${GITHUB_ACTOR:-}" ]]; then
        ui_step "Logging in to ${registry} (CI token)"
        echo "$GITHUB_TOKEN" | docker login "$registry" -u "$GITHUB_ACTOR" --password-stdin
        return 0
    fi

    ui_info "Using existing docker credentials for ${registry} (or public pulls)"
}
