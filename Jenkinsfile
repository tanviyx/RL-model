pipeline {
    agent any            // a Linux agent with Docker (and the docker compose plugin) installed

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 30, unit: 'MINUTES')
    }

    triggers {
        githubPush()                    // instant, from the GitHub webhook
        pollSCM('H/2 * * * *')         // fallback if the webhook cannot reach Jenkins
    }

    environment {
        COMPOSE_PROJECT_NAME = 'smartsignal'
        IMAGE_TAG            = "${env.BUILD_NUMBER}"
        CI_NET               = "ci-net-${env.BUILD_NUMBER}"
        CI_MODEL             = "ci-model-${env.BUILD_NUMBER}"
    }

    stages {
        // Jenkins checks out the repo before the first stage.

        stage('Build images') {
            steps {
                sh '''
                    docker build -f backend/Dockerfile --target test    -t smartsignal-backend-test:${IMAGE_TAG} .
                    docker build -f backend/Dockerfile --target runtime -t smartsignal-backend:${IMAGE_TAG} .
                    docker build -t smartsignal-model:${IMAGE_TAG} ./model
                '''
            }
        }

        stage('Test') {
            steps {
                sh '''
                    docker network create "$CI_NET"
                    # the model service must be running for the backend tests (they call /api/ai and run the DQN)
                    docker run -d --name "$CI_MODEL" --network "$CI_NET" --network-alias model \
                        smartsignal-model:${IMAGE_TAG}

                    for i in $(seq 1 30); do
                        [ "$(docker inspect -f '{{.State.Health.Status}}' "$CI_MODEL")" = "healthy" ] && break
                        sleep 3
                    done
                    [ "$(docker inspect -f '{{.State.Health.Status}}' "$CI_MODEL")" = "healthy" ] \
                        || { docker logs "$CI_MODEL"; exit 1; }

                    # API tests (login rules, validation, experiments, history, CSV export) against the real model
                    docker run --rm --network "$CI_NET" -e AI_SERVICE_URL=http://model:5001 \
                        smartsignal-backend-test:${IMAGE_TAG}
                '''
            }
        }

        stage('Deploy') {
            when { expression { (env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'main') ==~ /(origin\/)?main/ } }
            steps {
                // Secret file credential "smartsignal-env": the contents of your real .env (JWT, Google, SMTP)
                withCredentials([file(credentialsId: 'smartsignal-env', variable: 'APP_ENV_FILE')]) {
                    sh 'docker compose up -d --remove-orphans'
                }
            }
        }

        stage('Verify deployment') {
            when { expression { (env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'main') ==~ /(origin\/)?main/ } }
            steps {
                sh '''
                    retry() { tries=$1; delay=$2; shift 2
                        for i in $(seq 1 "$tries"); do "$@" && return 0; sleep "$delay"; done; return 1; }

                    healthy()  { [ "$(docker inspect -f '{{.State.Health.Status}}' "$1")" = "healthy" ]; }
                    api_ok()   { docker exec smartsignal_backend node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>process.exit(JSON.parse(b).database==='connected'?0:1))}).on('error',()=>process.exit(1))"; }
                    ai_locked(){ docker exec smartsignal_backend node -e "require('http').get('http://127.0.0.1:3000/api/ai/status',r=>process.exit(r.statusCode===401?0:1)).on('error',()=>process.exit(1))"; }

                    retry 30 4 healthy smartsignal_model   || { docker logs smartsignal_model --tail 60; exit 1; }
                    retry 30 4 healthy smartsignal_backend || { docker logs smartsignal_backend --tail 60; exit 1; }
                    retry 10 3 api_ok                      || { echo "backend is up but MongoDB is not connected"; exit 1; }
                    ai_locked                              || { echo "/api/ai/status should require a login (401)"; exit 1; }
                    echo "Model, backend and database are healthy; AI endpoint is login-protected."
                '''
            }
        }
    }

    post {
        always {
            sh '''
                docker rm -f "$CI_MODEL" 2>/dev/null || true
                docker network rm "$CI_NET" 2>/dev/null || true
                docker compose ps 2>/dev/null || true
            '''
        }
        failure {
            sh 'docker compose logs --tail=60 2>/dev/null || true'
        }
        success {
            echo "Build ${env.BUILD_NUMBER}: tests passed, images built" + ((env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'main') ==~ /(origin\/)?main/ ? ', stack deployed and verified.' : '.')
        }
    }
}
