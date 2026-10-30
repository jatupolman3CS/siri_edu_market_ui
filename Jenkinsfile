// SIRIEDUMARKET web (Angular + nginx) — build an arm64 image for ONE environment and roll it out.
// The image is NOT environment-neutral: the API origin is baked into the bundle at build time
// (NG_CONFIG=qa -> environment.qa.ts, NG_CONFIG=production -> environment.ts), so a QA image can
// never be promoted to prod by retagging — prod is always rebuilt from main.
// Runbook: docs/ENVIRONMENTS.md at the monorepo root.
//
//   TARGET_ENV=qa   : any branch, automatic (SCM-triggered builds use this default).
//   TARGET_ENV=prod : branch `main` only + manual `input` approval.

NAMESPACES = [qa: 'siriedumarket-dev', prod: 'siriedumarket-prd']
KUBE_CREDS = [qa: 'kubeconfig-siriedumarket-qa', prod: 'kubeconfig-siriedumarket-prod']
NG_CONFIGS = [qa: 'qa', prod: 'production']
WEB_HOSTS  = [qa: 'https://siriedumarket-qa.siristudiophoto.com', prod: 'https://siriedumarket.siristudiophoto.com']
COMPONENT  = 'siriedumarket-web'   // deployment == container == image repository

pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '30'))
    timestamps()
    timeout(time: 45, unit: 'MINUTES')
  }

  parameters {
    choice(name: 'TARGET_ENV', choices: ['qa', 'prod'], description: 'qa = any branch, automatic. prod = main only, needs approval.')
    string(name: 'REGISTRY', defaultValue: 'localhost:5000', description: 'Registry the k3s node pulls from (Oracle host registry).')
  }

  environment {
    DOCKER_BUILDKIT = '1'
  }

  stages {
    stage('Resolve') {
      steps {
        script {
          def target = params.TARGET_ENV ?: 'qa'
          if (!NAMESPACES.containsKey(target)) { error "Unknown TARGET_ENV '${target}'" }

          def branch = (env.BRANCH_NAME ?: env.GIT_BRANCH ?: sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim())
          branch = branch.replaceFirst(/^origin\//, '')
          def sha = sh(script: 'git rev-parse --short=7 HEAD', returnStdout: true).trim()

          if (target == 'prod' && branch != 'main') {
            error "Production deploys only from main (this build is '${branch}')."
          }

          env.T_ENV       = target
          env.T_NS        = NAMESPACES[target]
          env.T_KUBE_CRED = KUBE_CREDS[target]
          env.T_NG_CONFIG = NG_CONFIGS[target]
          env.T_WEB_HOST  = WEB_HOSTS[target]
          env.IMAGE_TAG   = "${target}-${sha}-b${env.BUILD_NUMBER}"
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${target} ${branch}@${sha}"
        }
      }
    }

    stage('Guard') {
      steps {
        sh '''
          set -eu
          docker buildx version >/dev/null
          # Each env file must point at its own API, and only production at the prod API.
          grep -q "apiUrl: 'https://api-siriedumarket-qa.siristudiophoto.com'" src/environments/environment.qa.ts
          grep -q "apiUrl: 'https://api-siriedumarket.siristudiophoto.com'"    src/environments/environment.ts
          grep -q "bypass: false" src/environments/environment.qa.ts
          grep -q "bypass: false" src/environments/environment.ts
        '''
      }
    }

    stage('Approve production') {
      when { expression { env.T_ENV == 'prod' } }
      steps {
        timeout(time: 30, unit: 'MINUTES') {
          input message: "Deploy web ${env.IMAGE_TAG} to PRODUCTION (namespace siriedumarket-prd)?",
                ok: 'Deploy to production'
        }
      }
    }

    stage('Build & push (arm64)') {
      steps {
        // NGINX_CONF=nginx/nginx.conf: listen 80 + `location ^~ /api/` -> http://backend:8080 (the
        // k8s Service in the SAME namespace). The Dockerfile default (nginx.web.conf, :8085) does
        // not match deploy/k8s/base/web.yaml.
        sh """
          set -eu
          docker buildx build --platform linux/arm64 --provenance=false \\
            --build-arg NG_CONFIG=${env.T_NG_CONFIG} \\
            --build-arg NGINX_CONF=nginx/nginx.conf \\
            --label org.opencontainers.image.revision=\$(git rev-parse HEAD) \\
            --label siriedumarket.env=${env.T_ENV} \\
            -t ${params.REGISTRY}/${COMPONENT}:${env.IMAGE_TAG} \\
            --load .
          docker push ${params.REGISTRY}/${COMPONENT}:${env.IMAGE_TAG}
        """
      }
    }

    stage('Deploy') {
      steps {
        withCredentials([file(credentialsId: env.T_KUBE_CRED, variable: 'KUBECONFIG')]) {
          sh "kubectl -n ${env.T_NS} get deployment ${COMPONENT} -o name"
          sh "kubectl -n ${env.T_NS} set image deployment/${COMPONENT} ${COMPONENT}=${params.REGISTRY}/${COMPONENT}:${env.IMAGE_TAG}"
          sh "kubectl -n ${env.T_NS} rollout status deployment/${COMPONENT} --timeout=180s"
        }
      }
    }

    stage('Smoke') {
      steps {
        sh """
          set -eu
          curl -fsS -o /dev/null ${env.T_WEB_HOST}/
          # nginx proxy -> this namespace's backend (the bundle's apiUrl is checked by the Guard stage)
          curl -fsS -o /dev/null ${env.T_WEB_HOST}/api/system/status
        """
      }
    }
  }

  post {
    failure {
      echo "Rollback (admin): kubectl -n ${env.T_NS} rollout undo deployment/${COMPONENT}"
    }
  }
}
