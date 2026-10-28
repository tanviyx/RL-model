pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 30, unit: 'MINUTES')   // a stuck build now fails by itself
    }

    triggers {
        githubPush()                    // instant, from the webhook
        pollSCM('H/15 * * * *')         // fallback if the tunnel is down
    }

    environment {
        // Same project name as a manual "docker compose up" in the RL-model folder,
        // so Jenkins replaces that stack (and reuses its database volume).
        COMPOSE_PROJECT_NAME = 'rl-model'
        JWT_SECRET       = credentials('capstone-jwt-secret')
        GOOGLE_CLIENT_ID = credentials('capstone-google-client-id')
    }

    stages {
        // Jenkins checks out the repo automatically before the first stage.

        stage('Server tests and policy gate') {
            steps {
                // unit tests, then: the installed Q-table must beat the best fixed timer on held-out days
                sh 'docker build --target test -t rl-server-test ./server'
            }
        }

        stage('Client lint and build') {
            steps {
                // lint problems mark the build UNSTABLE (yellow) but do not stop the pipeline
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sh 'docker build --target lint -t rl-client-lint ./client'
                }
                // the production build must succeed
                sh 'docker build --target build -t rl-client-build ./client'
            }
        }

        stage('Deploy') {
            steps {
                // builds the images and replaces the running containers in one step
                sh 'docker compose up -d --build --remove-orphans'
            }
        }

        stage('Verify deployment') {
            steps {
                sh '''
                    # retry <tries> <seconds> <command...>
                    retry() {
                        tries=$1; delay=$2; shift 2
                        for i in $(seq 1 "$tries"); do
                            "$@" && return 0
                            sleep "$delay"
                        done
                        return 1
                    }

                    backend_ok() {
                        [ "$(docker inspect -f '{{.State.Health.Status}}' traffic_backend)" = "healthy" ]
                    }

                    frontend_ok() {
                        docker exec traffic_frontend node -e "require('https').get('https://localhost:5173',{rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
                    }

                    retry 40 4 backend_ok  || { docker logs traffic_backend --tail 60; exit 1; }
                    retry 20 3 frontend_ok || { docker logs traffic_frontend --tail 60; exit 1; }
                    echo "Backend healthy, frontend answering."
                '''
            }
        }
    }

    post {
        always {
            sh 'docker compose ps || true'
        }
        failure {
            sh 'docker compose logs --tail=60 || true'
        }
        success {
            echo 'Tests passed, policy gate passed, stack deployed and healthy.'
        }
    }
}


