import { lead } from "@prisma/client";
import Bottleneck from 'bottleneck';
import { countryDialCodeMap } from "../utils/constants";
import { getApiKey } from "../utils/apiKeyProvider";

const providerLimiters = {
    orionConnect: new Bottleneck({
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60 * 1000,
        maxConcurrent: 5,
    }),
    astraDialer: new Bottleneck({
        reservoir: 200,
        reservoirRefreshAmount: 200,
        reservoirRefreshInterval: 60 * 1000,
        maxConcurrent: 10,
    }),
    nimbusLookup: new Bottleneck({
        reservoir: 50,
        reservoirRefreshAmount: 50,
        reservoirRefreshInterval: 60 * 1000,
        maxConcurrent: 3,
    }),
};

export async function verifyEmail(email: string): Promise<boolean> {
    if (email.includes('john.doe')) {
        return false;
    }

    if (email.includes('jane.smith')) {
        await new Promise((resolve) => setTimeout(resolve, 20000));
    }

    if (/\+/.test(email)) {
        return false;
    }

    return true;
}

export async function findPhoneOrionConnect(lead: lead): Promise<string | null> {
    return providerLimiters.orionConnect.schedule(async () => {
        try {
            const baseUrl = "https://api.genesy.ai/api/tmp/orionConnect";
            const reqBody = {
                fullName: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
                companyWebsite: lead.email.split('@')[1] || "",
            };
            
            const response = await fetch(baseUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-me": getApiKey('orionConnect'),
                },
                body: JSON.stringify(reqBody),
            });
            
            const data = await response.json();
            
            if (typeof data.phone === "string" && data.phone.trim() !== "") {
                return data.phone.trim();
            }
            return null;
        } catch (e) {
            console.error(`OrionConnect provider failed for lead ${lead.id}`);
            console.error(JSON.stringify(lead));
            console.error(e);
            return null;
        }
    });
}

export async function findPhoneAstraDialer(lead: lead): Promise<string | null> {
    return providerLimiters.astraDialer.schedule(async () => {
        try {
            const baseUrl = "https://api.genesy.ai/api/tmp/astraDialer";
            const reqBody = {
                email: lead.email,
            };
            
            const response = await fetch(baseUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apiKey": getApiKey('astraDialer'),
                },
                body: JSON.stringify(reqBody),
            });
            
            const data = await response.json();
            
            if (typeof data.phoneNmbr === "string" && data.phoneNmbr.trim() !== "") {
                return data.phoneNmbr.trim();
            }
            return null;
        } catch (e) {
            console.error(`AstraDialer provider failed for lead ${lead.id}`);
            console.error(JSON.stringify(lead));
            console.error(e);
            return null;
        }
    });
}

export async function findPhoneNimbusLookup(lead: lead): Promise<string | null> {
    return providerLimiters.nimbusLookup.schedule(async () => {
        try {
            const baseUrl = "https://api.genesy.ai/api/tmp/numbusLookup";
            const urlWithApiKey = `${baseUrl}?api=${getApiKey('nimbusLookup')}`;
            const reqBody = {
                email: lead.email,
                jobTitle: lead.jobTitle || "",
            };
            
            const response = await fetch(urlWithApiKey, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(reqBody),
            });
            
            const data = await response.json();

            if (typeof data.number === "number" && !!data.countryCode) {
                const dialCode = countryDialCodeMap[data.countryCode] || data.countryCode;
                return `${dialCode}${data.number}`;
            }
            return null;
        } catch (e) {
            console.error(`NimbusLookup provider failed for lead ${lead.id}`);
            console.error(JSON.stringify(lead));
            console.error(e);
            return null;
        }
    })
}