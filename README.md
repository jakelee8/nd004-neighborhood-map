# Neighborhood Map

A demo web app using Google Maps API, KnockoutJS, and Zurb Foundation.
Additional data provided by Google Maps Places. This project was built as
part of the Udacity Full Stack Web Developer Nanodegree program. See it in
[action here][demo]!


## Requirements

This project uses the [Yarn package manager][yarn] to install dependencies
and run commands. On OS X, use [Homebrew][brew] to install Yarn.

```sh
brew install yarn
```

On other platforms, please visit the [Yarn][yarn] website for instructions.

Next, install the project dependencies with Yarn.

```sh
yarn install
```


## Develop

To start the development server, run the following command.

```sh
yarn start
```

This will start the build process, web server, and open your web browser to
view the web app. Changes to source files will update the browser
automatically.


## Deploy

To build the site into a form suitable for upload to a static web server,
run the following command.

```sh
yarn build
```

This command will compile the source files into the `dist/` directory. The
contents of this directory are ready to be uploaded to a web server.


[demo]: https://jakelee8.github.io/nd004-neighborhood-map
[yarn]: https://yarnpkg.com
[brew]: https://brew.sh
