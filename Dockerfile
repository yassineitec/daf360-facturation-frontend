FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY .npmrc ./
RUN npm ci --legacy-peer-deps
COPY . .
# native-federation ng build writes dist then hangs; timeout kills it after
# output is produced, and the test fails the build loudly if remoteEntry.json
# is missing (instead of shipping an empty nginx page).
RUN timeout 240 npm run build; \
    test -f dist/daf360-facturation/browser/remoteEntry.json

FROM nginx:alpine
COPY --from=build /app/dist/daf360-facturation/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
