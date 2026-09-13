# BRouter as a local container. There is no official image on Docker Hub
# (the compose file used to point at abrensch/brouter, which does not exist),
# so this builds one from the project's own release zip: the routing server
# jar, its stock profiles and the lookups.dat every profile needs.
#
# Java lives in here and nowhere else on the machine. The note that "this
# machine has no Java" only ever mattered for running the jar natively.
FROM eclipse-temurin:17-jre

ARG BROUTER_VERSION=1.7.10

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip wget \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/brouter.zip \
      "https://github.com/abrensch/brouter/releases/download/v${BROUTER_VERSION}/brouter-${BROUTER_VERSION}.zip" \
 && mkdir -p /opt && cd /opt && unzip -q /tmp/brouter.zip \
 && mv "brouter-${BROUTER_VERSION}" brouter && rm /tmp/brouter.zip \
 && ln -s "/opt/brouter/brouter-${BROUTER_VERSION}-all.jar" /opt/brouter/brouter.jar

COPY entrypoint.sh /entrypoint.sh
# The file is authored on Windows; a CR after the shebang breaks sh.
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 17777
ENTRYPOINT ["/entrypoint.sh"]
