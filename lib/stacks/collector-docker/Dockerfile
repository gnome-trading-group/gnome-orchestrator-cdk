FROM azul/zulu-openjdk:17

      RUN yum install -y wget jq

      ARG MAIN_CLASS

      RUN --mount=type=secret,id=MAVEN_CREDENTIALS         export MAVEN_CREDENTIALS=$(cat /run/secrets/MAVEN_CREDENTIALS) &&         MAVEN_USERNAME=$(echo $MAVEN_CREDENTIALS | jq -r '.GITHUB_ACTOR') &&         MAVEN_PASSWORD=$(echo $MAVEN_CREDENTIALS | jq -r '.GITHUB_TOKEN') &&         wget --user=$MAVEN_USERNAME --password=$MAVEN_PASSWORD -O app.jar "https://maven.pkg.github.com/gnome-trading-group/gnome-orchestrator/group/gnometrading/gnome-orchestrator/1.0.21/gnome-orchestrator-1.0.21.jar"

      RUN echo '#!/bin/sh
exec java --add-opens=java.base/sun.nio.ch=ALL-UNNAMED -cp app.jar $MAIN_CLASS' > start.sh && chmod +x start.sh

      CMD ["./start.sh"]