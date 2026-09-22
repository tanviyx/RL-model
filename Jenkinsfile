pipeline {
    agent any

    environment {
        JWT_SECRET  = credentials('capstone-jwt-secret')
        SMTP_USER   = credentials('capstone-smtp-user')
        SMTP_PASS   = credentials('capstone-smtp-pass')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Stop Old Containers') {
            steps {
                bat 'docker compose down --remove-orphans || exit 0'
            }
        }

        stage('Build Docker Images') {
            steps {
                bat 'docker compose build'
            }
        }

        stage('Deploy Containers') {
            steps {
                bat 'docker compose up -d --remove-orphans'
            }
        }

        stage('Verify Deployment') {
            steps {
                bat 'docker ps'
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

