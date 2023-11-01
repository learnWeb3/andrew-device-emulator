const { default: axios } = require("axios");

class KeycloakClient {
    constructor(baseURL = "", credentials = {
        clientId: "",
        clientSecret: ""
    }) {
        this.httpClient = axios.create({
            baseURL,
            timeout: 1000
        });
        this.credentials = credentials;
    }

    async authenticate() {
        const params = new URLSearchParams();
        params.append('client_id', this.credentials.clientId);
        params.append('client_secret', this.credentials.clientSecret);
        params.append('grant_type', 'client_credentials')
        return await this.httpClient.post('/protocol/openid-connect/token', params)
            .then(({ data }) => data)
    }

}

module.exports = { KeycloakClient }