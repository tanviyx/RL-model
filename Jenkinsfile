pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    triggers {
        // Jenkins runs on localhost, so GitHub cannot call it: look for new commits every ~5 minutes
        pollSCM('H/5 * * * *')
    }

    environment {
        // Same project name as a manual "docker compose up" in the RL-model folder, so Jenkins
        // replaces that stack (and reuses its database volume) instead of creating a second one.
        COMPOSE_PROJECT_NAME = 'rl-model'
        JWT_SECRET       = credentials('capstone-jwt-secret')
        GOOGLE_CLIENT_ID = credentials('capstone-google-client-id')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Server tests and policy gate') {
            steps {
                // unit tests, then: the installed Q-table must beat the best fixed timer on held-out days
                sh 'docker build --target test -t rl-server-test ./server'
            }
        }

        stage('Client lint (report only)') {
            steps {
                // problems mark the build UNSTABLE (yellow) but do not stop the pipeline
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    sh 'docker build --target lint -t rl-client-lint ./client'
                }
            }
        }

        stage('Client production build') {
            steps {
                sh 'docker build --target build -t rl-client-build ./client'
            }
        }

        stage('Build images') {
            steps {
                sh 'docker compose build'
            }
        }

        stage('Deploy') {
            steps {
                sh 'docker compose down --remove-orphans || true'
                sh 'docker compose up -d'
            }
        }

        stage('Verify deployment') {
            steps {
                sh '''
                    echo "Waiting for the backend to report healthy..."
                    for i in $(seq 1 40); do
                        status=$(docker inspect --format '{{.State.Health.Status}}' traffic_backend 2>/dev/null || echo missing)
                        echo "backend health: $status"
                        if [ "$status" = "healthy" ]; then break; fi
                        if [ "$i" = "40" ]; then docker logs traffic_backend --tail 60; exit 1; fi
                        sleep 4
                    done

                    echo "Checking that the frontend answers..."
                    for i in $(seq 1 20); do
                        if docker exec traffic_frontend node -e "require('https').get('https://localhost:5173',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"; then
                            echo "frontend OK"
                            exit 0
                        fi
                        sleep 3
                    done
                    docker logs traffic_frontend --tail 60
                    exit 1
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


