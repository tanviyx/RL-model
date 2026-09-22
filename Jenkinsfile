pipeline {
    agent any

    environment {
        JWT_SECRET = credentials('capstone-jwt-secret')
        SMTP_USER  = credentials('capstone-smtp-user')
        SMTP_PASS  = credentials('capstone-smtp-pass')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Stop Old Containers') {
            steps {
                sh 'docker compose down --remove-orphans || true'
            }
        }

        stage('Build Docker Images') {
            steps {
                sh 'docker compose build'
            }
        }

        stage('Deploy Containers') {
            steps {
                sh 'docker compose up -d --remove-orphans'
            }
        }

        stage('Verify Deployment') {
            steps {
                sh 'docker ps'
            }
        }
    }

    post {
        success {
            echo 'Deployment Successful'
        }
        failure {
            echo 'Pipeline Failed'
        }
    }
}

