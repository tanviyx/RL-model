import jenkins.model.* 
import hudson.security.* 
def hudsonRealm = new HudsonPrivateSecurityRealm(false) 
hudsonRealm.createAccount("admin", "ResetPassword123!") 
Jenkins.instance.setSecurityRealm(hudsonRealm) 
Jenkins.instance.save() 
