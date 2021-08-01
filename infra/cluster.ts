// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

import * as containerservice from "@pulumi/azure-native/containerservice";
import * as azuread from "@pulumi/azuread";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { resourceGroup } from "./resourcegroup";
import * as config from "./config";


const adApp = new azuread.Application("app", {
    displayName: "app",
});

const adSp = new azuread.ServicePrincipal("service-principal", {
    applicationId: adApp.applicationId,
});

const adSpPassword = new azuread.ServicePrincipalPassword("sp-password", {
    servicePrincipalId: adSp.id,
    value: config.password,
    endDate: "2099-01-01T00:00:00Z",
});

export const k8sCluster = new containerservice.ManagedCluster("cluster", {
    resourceGroupName: resourceGroup.name,
    addonProfiles: {
        KubeDashboard: {
            enabled: true,
        },
    },
    agentPoolProfiles: [{
        count: config.nodeCount,
        maxPods: 110,
        mode: "System",
        name: "agentpool",
        nodeLabels: {},
        osDiskSizeGB: 30,
        osType: "Linux",
        type: "VirtualMachineScaleSets",
        vmSize: config.nodeSize,
    }],
    dnsPrefix: resourceGroup.name,
    enableRBAC: true,
    kubernetesVersion: config.k8sVersion,
    linuxProfile: {
        adminUsername: config.adminUserName,
        ssh: {
            publicKeys: [{
                keyData: config.sshPublicKey,
            }],
        },
    },
    nodeResourceGroup: "node-resource-group",
    servicePrincipalProfile: {
        clientId: adApp.applicationId,
        secret: adSpPassword.value,
    },
});

const creds = pulumi.all([k8sCluster.name, resourceGroup.name]).apply(([clusterName, rgName]) => {
    return containerservice.listManagedClusterUserCredentials({
        resourceGroupName: rgName,
        resourceName: clusterName,
    });
});

export const kubeconfig =
    creds.kubeconfigs[0].value
    .apply(enc => Buffer.from(enc, "base64").toString());

export const k8sProvider = new k8s.Provider("k8s-provider", {
    kubeconfig: kubeconfig,
});